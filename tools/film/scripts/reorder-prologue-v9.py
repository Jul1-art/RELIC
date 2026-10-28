"""Make a chronological 1080p50 edit from the verified distributed V9 film.

Requires PyAV, NumPy and FFmpeg with libx264/AAC. FFmpeg may be supplied with
--ffmpeg, found on PATH, or provided by the optional imageio-ffmpeg package.
Original source footage and narration models are not needed. This writes only
to the chosen work directory; publishing and updating runtime metadata are
separate operations. Most H.264 packets are retained byte-for-byte. Only the
first closed GOP at each changed join is rebuilt to remove baked old dissolves.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

import av
import numpy as np


ROOT = Path(__file__).resolve().parents[3]
FPS, WIDTH, HEIGHT, TIMESCALE = 50, 1920, 1080, 12800
SAMPLE_RATE, DURATION = 48000, 569
FRAME_TICKS = TIMESCALE // FPS
FRAME_COUNT = DURATION * FPS
PCM_SAMPLES = DURATION * SAMPLE_RATE
REVISION = "9.1-hd50"
RELEASE = "v9-1-hd50"
# Read from the shared chronology manifest; every source frame is used once.
BLOCKS = []
REPAIR_SECONDS = 2
JOIN_FADE_SECONDS = .005


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as file:
        for block in iter(lambda:file.read(1024*1024),b""):digest.update(block)
    return digest.hexdigest()


def write(path,value):
    path=Path(path);temporary=path.with_suffix(path.suffix+".tmp")
    temporary.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    temporary.replace(path)


def ff(executable,*args,cwd=None):
    completed=subprocess.run([str(executable),"-hide_banner","-loglevel","error","-y",*map(str,args)],
                             cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding="utf-8",errors="replace")
    if completed.returncode:
        raise RuntimeError("FFmpeg failed: "+completed.stderr[-8000:])


def ffmpeg_path(explicit):
    if explicit:return str(explicit)
    executable=shutil.which("ffmpeg")
    if executable:return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise RuntimeError("Supply --ffmpeg, install FFmpeg, or install imageio-ffmpeg") from error


def verify_source(source,encoding):
    metadata=json.loads(encoding.read_text(encoding="utf-8"))
    if metadata.get("revision")!="9.0-hd50":raise ValueError("The source receipt must describe the original V9.0 edit")
    if (metadata.get("width"),metadata.get("height"),metadata.get("fps"),metadata.get("duration"))!=(WIDTH,HEIGHT,FPS,DURATION):
        raise ValueError("Source receipt does not describe the checked 1080p50 film")
    records=metadata["hls"]["files"]
    for record in records:
        path=(encoding.parent/record["path"]).resolve()
        if not path.is_relative_to(encoding.parent.resolve()):raise ValueError("Source manifest path escapes media root")
        if not record["path"].startswith("v9-0-hd50/") or not path.is_relative_to(source):
            raise ValueError("Source receipt contains a different HLS edition")
        if not path.is_file() or path.stat().st_size!=record["bytes"] or sha(path)!=record["sha256"]:
            raise ValueError("Source integrity mismatch: "+record["path"])
    if not source.is_dir():raise ValueError("Source HLS directory is missing")
    return sha(encoding)


def remux(source,target,kind):
    """Materialize the fragmented stream for reliable, frame-accurate seeking."""
    with av.open(str(source)) as incoming:
        stream=incoming.streams.video[0] if kind=="video" else incoming.streams.audio[0]
        with av.open(str(target),"w",options={"movflags":"+faststart"}) as outgoing:
            destination=outgoing.add_stream_from_template(stream)
            packets=0
            for packet in incoming.demux(stream):
                if packet.dts is None or not packet.size:continue
                packet.stream=destination;outgoing.mux(packet);packets+=1
    return packets


def load_video(path):
    with av.open(str(path)) as container:
        stream=container.streams.video[0]
        if stream.time_base!=Fraction(1,TIMESCALE):raise ValueError("Unexpected source video clock")
        packets=[packet for packet in container.demux(stream) if packet.dts is not None and packet.size]
        if len(packets)!=FRAME_COUNT:raise ValueError("Source frame/packet count differs from checked edit")
        for index,packet in enumerate(packets):
            if packet.dts!=index*FRAME_TICKS or packet.duration!=FRAME_TICKS:
                raise ValueError("Nonuniform source decode clock")
        for start,end,_ in BLOCKS:
            if not packets[start*FPS].is_keyframe:raise ValueError("An edit starts outside a closed GOP")
            if end<DURATION and not packets[end*FPS].is_keyframe:raise ValueError("An edit ends outside a closed GOP")
        return stream,packets


def make_repairs(executable,master,work,plan,source_hash,template):
    shots=plan["shots"]
    repairs={}
    original_predecessors={shot["start"]:shots[index-1] if index else None for index,shot in enumerate(shots)}
    boundaries=[(destination,start) for index,(start,end,destination) in enumerate(BLOCKS)
                if index and start!=BLOCKS[index-1][1]]
    extradata=template.codec_context.extradata
    primaries,trc,matrix=(template.codec_context.color_primaries,template.codec_context.color_trc,template.codec_context.colorspace)
    for destination,start in boundaries:
        previous=original_predecessors[start]
        incoming=round(float(previous.get("transitionOut",plan.get("crossfadeSeconds",.75)))*FPS)/FPS
        if not 0<=incoming<REPAIR_SECONDS:raise ValueError("Incoming dissolve exceeds repair GOP")
        clean=REPAIR_SECONDS-incoming
        target=work/f"repair-{destination:03d}.mp4"
        record=target.with_suffix(".json")
        signature={"sourceEncodingSha256":source_hash,"sourceStart":start,"destinationStart":destination,
                   "incomingSeconds":incoming,"repairSeconds":REPAIR_SECONDS,"fps":FPS,"renderer":"clean-incoming-gop-2",
                   "colorPrimaries":primaries,"colorTransfer":trc,"colorMatrix":matrix}
        saved=json.loads(record.read_text(encoding="utf-8")) if record.exists() else {}
        if not (target.is_file() and saved.get("input")==signature and saved.get("sha256")==sha(target)):
            filters=(f"trim=duration={clean:.10f},setpts=(PTS-STARTPTS)*{REPAIR_SECONDS}/{clean:.10f},"
                     f"fps={FPS},tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame={REPAIR_SECONDS*FPS},"
                     f"setpts=N/({FPS}*TB),format=yuv420p,"
                     f"setparams=range=limited:color_primaries={primaries}:color_trc={trc}:colorspace={matrix},"
                     "fade=t=in:st=0:d=0.08")
            # Match the distributed V9 encoder parameters, including its SPS/PPS.
            ff(executable,"-threads",1,"-ss",start+incoming,"-i",master,"-an","-vf",filters,
               "-frames:v",REPAIR_SECONDS*FPS,"-c:v","libx264","-threads",2,"-preset","fast","-crf",23,
               "-maxrate",3000000,"-bufsize",6000000,"-pix_fmt","yuv420p","-profile:v","high","-level","4.2",
               "-g",100,"-keyint_min",100,"-sc_threshold",0,"-x264-params","repeat-headers=1:open-gop=0",
               "-color_primaries",primaries,"-color_trc",trc,"-colorspace",matrix,"-color_range","tv",
               "-r",FPS,"-video_track_timescale",TIMESCALE,"-avoid_negative_ts","make_zero","-movflags","+faststart",target)
            write(record,{"input":signature,"sha256":sha(target)})
        with av.open(str(target)) as container:
            stream=container.streams.video[0]
            if stream.codec_context.extradata!=extradata:
                raise ValueError("Repaired GOP SPS/PPS differs: do not combine incompatible H.264 streams")
            packets=[p for p in container.demux(stream) if p.dts is not None and p.size]
            if len(packets)!=REPAIR_SECONDS*FPS or packets[0].dts!=0 or not packets[0].is_keyframe:
                raise ValueError("Repair is not an exact two-second closed GOP")
            repairs[destination*FPS]=packets
        print(json.dumps({"stage":"repair","destination":destination,"source":start,"cleanStart":start+incoming,"frames":len(packets),"parameterSetsMatch":True}),flush=True)
    return repairs


def assemble_video(master,target,work,plan,executable,source_hash):
    template,packets=load_video(master)
    repairs=make_repairs(executable,master,work,plan,source_hash,template)
    mapping=[]
    for start,end,destination in BLOCKS:
        if len(mapping)!=destination*FPS:raise ValueError("Edit map is not contiguous")
        mapping.extend(range(start*FPS,end*FPS))
    if len(mapping)!=FRAME_COUNT or sorted(mapping)!=list(range(FRAME_COUNT)):
        raise ValueError("Edit must use each source frame exactly once")
    copied=reencoded=0
    with av.open(str(master)) as template_container, av.open(str(target),"w",options={"movflags":"+faststart"}) as output:
        stream=output.add_stream_from_template(template_container.streams.video[0])
        stream.time_base=Fraction(1,TIMESCALE)
        for destination,source in enumerate(mapping):
            repair_start=max((start for start in repairs if start<=destination),default=-1)
            if repair_start>=0 and destination<repair_start+REPAIR_SECONDS*FPS:
                original=repairs[repair_start][destination-repair_start];reencoded+=1
            else:
                original=packets[source];copied+=1
            packet=av.Packet(bytes(original))
            packet.dts=destination*FRAME_TICKS
            packet.pts=packet.dts+(original.pts-original.dts)
            packet.duration=FRAME_TICKS;packet.time_base=Fraction(1,TIMESCALE)
            packet.is_keyframe=original.is_keyframe;packet.stream=stream
            output.mux(packet)
    if copied+reencoded!=FRAME_COUNT or reencoded!=600:raise ValueError("Unexpected copy/repair coverage")
    print(json.dumps({"stage":"picture-assembled","copiedFrames":copied,"reencodedFrames":reencoded}),flush=True)
    return {"copiedFrames":copied,"reencodedFrames":reencoded,"parameterSetsMatch":True}


def mix_audio(executable,source,target):
    graph=[f"[0:a]aresample={SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
           f"apad=whole_len={PCM_SAMPLES},atrim=end_sample={PCM_SAMPLES},asplit={len(BLOCKS)}"+
           "".join(f"[a{i}]" for i in range(len(BLOCKS)))]
    for index,(start,end,_) in enumerate(BLOCKS):
        filters=f"[a{index}]atrim=start_sample={start*SAMPLE_RATE}:end_sample={end*SAMPLE_RATE},asetpts=PTS-STARTPTS"
        if index:filters+=f",afade=t=in:st=0:d={JOIN_FADE_SECONDS}"
        if index<len(BLOCKS)-1:filters+=f",afade=t=out:st={end-start-JOIN_FADE_SECONDS:.9f}:d={JOIN_FADE_SECONDS}"
        graph.append(filters+f"[b{index}]")
    graph.append("".join(f"[b{i}]" for i in range(len(BLOCKS)))+f"concat=n={len(BLOCKS)}:v=0:a=1[outa]")
    ff(executable,"-i",source,"-filter_complex_threads",1,"-filter_complex",";".join(graph),"-map","[outa]",
       "-t",DURATION,"-vn","-c:a","aac","-b:a",192000,"-ar",SAMPLE_RATE,"-ac",2,
       "-map_metadata","-1","-movflags","+faststart",target)


def package(executable,source,directory,kind):
    directory.mkdir(parents=True,exist_ok=True)
    # Output -ss 0 discards the negative-PTS AAC encoder-priming packet. Without
    # it, fragmented delivery would add 1024 samples of delay to the new mix.
    selection=["-map","0:v:0","-an","-c:v","copy","-tag:v","avc1"] if kind=="video" else ["-ss",0,"-map","0:a:0","-vn","-c:a","copy"]
    ff(executable,"-i",source.resolve(),*selection,"-map_metadata","-1","-f","hls","-hls_time",8,
       "-hls_playlist_type","vod","-hls_segment_type","fmp4","-hls_fmp4_init_filename","init.mp4",
       "-hls_flags","independent_segments","-hls_segment_filename","segment-%03d.m4s","index.m3u8",cwd=directory.resolve())


def validate_video(path):
    frames=0;previous=None;first=None;last=None
    with av.open(str(path)) as container:
        stream=container.streams.video[0]
        stream.codec_context.thread_count=4
        if stream.average_rate!=FPS:raise ValueError("Output picture cadence changed")
        for frame in container.decode(stream):
            if (frame.width,frame.height)!=(WIDTH,HEIGHT):raise ValueError("Output dimensions changed")
            clock=Fraction(frame.pts)*frame.time_base
            if previous is not None and clock-previous!=Fraction(1,FPS):raise ValueError("Picture presentation clock is discontinuous")
            if first is None:first=clock
            previous=last=clock;frames+=1
    if frames!=FRAME_COUNT:raise ValueError(f"Decoded {frames} frames instead of {FRAME_COUNT}")
    return {"fullDecodePassed":True,"frames":frames,"fps":FPS,"width":WIDTH,"height":HEIGHT,"timeBase":"1/12800",
            "firstPicturePtsSeconds":float(first),"lastPicturePtsSeconds":float(last),"pictureSpanSeconds":float(last-first+Fraction(1,FPS))}


def validate_audio(path):
    samples=0;peak=0.;first=None;last=None
    with av.open(str(path)) as container:
        stream=container.streams.audio[0]
        for frame in container.decode(stream):
            if frame.sample_rate!=SAMPLE_RATE or len(frame.layout.channels)!=2:raise ValueError("Output audio format changed")
            if first is None:first=float(frame.pts*frame.time_base)
            last=float(frame.pts*frame.time_base)+frame.samples/frame.sample_rate
            samples+=frame.samples;peak=max(peak,float(np.max(np.abs(frame.to_ndarray()))))
    # Normal final AAC encoder padding may remain in fragmented delivery.
    if not PCM_SAMPLES<=samples<=PCM_SAMPLES+1024:raise ValueError("Audio sample duration exceeds AAC padding tolerance")
    return {"fullDecodePassed":True,"sampleRate":SAMPLE_RATE,"channels":2,"timeBase":"1/48000","decodedSamples":samples,
            "plannedPcmSamples":PCM_SAMPLES,"decodedSeconds":samples/SAMPLE_RATE,
            "firstAudioPtsSeconds":first,"lastAudioEndSeconds":last,"samplePeak":round(peak,6)}


def prefix_lag_samples(original,delivery):
    """Measure fresh AAC priming against the unchanged five-second opening."""
    count=5*SAMPLE_RATE
    def prefix(path):
        chunks=[];length=0
        with av.open(str(path)) as container:
            for frame in container.decode(audio=0):
                chunk=frame.to_ndarray().mean(axis=0)
                chunks.append(chunk);length+=len(chunk)
                if length>=count:break
        return np.concatenate(chunks)[:count]
    source=prefix(original);edited=prefix(delivery)
    size=1<<(2*count-1).bit_length()
    correlation=np.fft.irfft(np.fft.rfft(edited,size)*np.conj(np.fft.rfft(source,size)),size)
    index=int(np.argmax(correlation))
    lag=index if index<size//2 else index-size
    if abs(lag)>1:raise ValueError(f"New AAC packaging introduces {lag} samples of delay")
    return lag


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path,default=ROOT/"intro/assets/prologue/v9-0-hd50")
    source_receipt=ROOT/"intro/assets/prologue/encoding-v9-0-source.json"
    parser.add_argument("--encoding",type=Path,default=source_receipt if source_receipt.is_file() else ROOT/"intro/assets/prologue/encoding-v9-hd50.json")
    source_plan=ROOT/"tools/film/reference/prologue-edit-v9-source.json"
    parser.add_argument("--plan",type=Path,default=source_plan if source_plan.is_file() else ROOT/"tools/film/scripts/prologue-edit-v9.json")
    parser.add_argument("--chronology",type=Path,default=ROOT/"tools/film/scripts/prologue-chronology-v9.json")
    parser.add_argument("--work",type=Path,default=ROOT/"media-work/v9-chronology")
    parser.add_argument("--ffmpeg",type=Path)
    args=parser.parse_args();started=time.monotonic()
    global BLOCKS,REVISION
    chronology=json.loads(args.chronology.read_text(encoding="utf-8"))
    if chronology.get("sourceRevision")!="9.0-hd50":raise ValueError("Chronology must address the checked V9.0 source")
    if chronology.get("duration")!=DURATION:raise ValueError("Chronology duration differs from checked source")
    BLOCKS=[(entry["sourceStart"],entry["sourceEnd"],entry["start"]) for entry in chronology["blocks"]]
    REVISION=chronology["revision"]
    source=args.source.resolve();work=args.work.resolve();work.mkdir(parents=True,exist_ok=True)
    if work==source or work in source.parents or source in work.parents:raise ValueError("Source and work directories must be separate")
    executable=ffmpeg_path(args.ffmpeg)
    source_hash=verify_source(source,args.encoding.resolve())
    plan=json.loads(args.plan.read_text(encoding="utf-8"))
    source_shots={shot["id"]:shot for shot in plan["shots"]}
    for identity,start,end in [("v2",105,113),("von-braun",113,123),("shuttle-carrier",275,283),("falcon-launch",469,481)]:
        if (source_shots[identity]["start"],source_shots[identity]["end"])!=(start,end):
            raise ValueError("Supply the original V9.0 source picture plan, not the reordered delivery plan")
    print(json.dumps({"stage":"source-verified","sourceEncodingSha256":source_hash}),flush=True)
    video_master=work/"video-master-v9.mp4"
    remux(source/"video/index.m3u8",video_master,"video")
    picture=work/"picture-chronological.mp4"
    picture_report=assemble_video(video_master,picture,work,plan,executable,source_hash)
    release=work/RELEASE
    package(executable,picture,release/"video","video")
    audio_reports={}
    for language in ["en","fr"]:
        native=work/f"audio-master-v9-{language}.m4a"
        remux(source/f"audio-{language}/index.m3u8",native,"audio")
        edited=work/f"audio-chronological-{language}.m4a"
        mix_audio(executable,native,edited)
        package(executable,edited,release/f"audio-{language}","audio")
        (release/f"{language}.m3u8").write_bytes((source/f"{language}.m3u8").read_bytes())
        audio_reports[language]=validate_audio(release/f"audio-{language}/index.m3u8")
        audio_reports[language]["prefixLagSamples"]=prefix_lag_samples(native,release/f"audio-{language}/index.m3u8")
        audio_reports[language]["encoderPrimingDiscarded"]=True
        print(json.dumps({"stage":"audio-validated","language":language,**audio_reports[language]}),flush=True)
    video_report=validate_video(release/"video/index.m3u8")
    files=[{"path":path.relative_to(work).as_posix(),"bytes":path.stat().st_size,"sha256":sha(path)} for path in sorted(release.rglob("*")) if path.is_file()]
    if max(item["bytes"] for item in files)>=25*1024*1024:raise ValueError("An HLS file exceeds the static host resource limit")
    portable=lambda path:path.resolve().relative_to(ROOT).as_posix() if path.resolve().is_relative_to(ROOT) else path.name
    report={"revision":REVISION,"duration":DURATION,"sourceEncodingSha256":source_hash,
            "sourceEncoding":portable(args.encoding),"sourcePlan":portable(args.plan),"sourcePlanSha256":sha(args.plan),
            "editMap":[{"sourceStart":start,"sourceEnd":end,"start":destination,"end":destination+end-start} for start,end,destination in BLOCKS],
            "picture":{**picture_report,**video_report},"audio":audio_reports,
            "repairPolicy":"Six changed incoming closed GOPs (two seconds each) are rebuilt using clean frames after the original baked dissolve. These clean frames are retimed with frame repetition to fill the same two seconds, with an 80 ms fade from black. All other H.264 packet payloads are copied. Parameter sets must match byte-for-byte. No optical flow, generated imagery or source-resolution enlargement is used.",
            "audioPolicy":"Both distributed premixed AAC tracks are decoded, cut at exact 48 kHz sample positions, concatenated in the edit order with 5 ms join fades, and reencoded to stereo AAC 192 kb/s. The fresh negative-PTS encoder-priming packet is discarded at packaging to retain the original sample clock. No intelligible speech intersects a join fade. Final AAC padding is reported separately.",
            "provenance":"Derived from the checksum-verified distributed V9 1080p50 picture and English/French mixes. Original production footage and isolated narration/music stems are not used.",
            "hls":{"directory":RELEASE,"files":files,"totalBytes":sum(item["bytes"] for item in files),"largestAssetBytes":max(item["bytes"] for item in files)},
            "elapsedSeconds":round(time.monotonic()-started,3)}
    write(work/"report.json",report)
    print(json.dumps({"stage":"complete","report":"media-work/v9-chronology/report.json","frames":FRAME_COUNT,"files":len(files),"bytes":report["hls"]["totalBytes"],"elapsedSeconds":report["elapsedSeconds"]}),flush=True)


if __name__=="__main__":main()
