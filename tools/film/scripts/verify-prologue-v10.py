"""Measure narration alignment against the actual delivered bilingual AAC streams.

This verifies the finished waveform, not just JSON timestamps. It also checks
that the requested V2 and flag passages have no spoken or archival tracks.
"""
from pathlib import Path
import argparse
import importlib.util
import json

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
RATE = 48000


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def correlate(reference, actual, padding):
    reference = reference.astype(np.float64); actual = actual.astype(np.float64)
    reference -= reference.mean(); actual -= actual.mean()
    size = 1 << (len(reference)+len(actual)-1).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(actual,size)*np.conj(np.fft.rfft(reference,size)),size)
    location = int(np.argmax(correlation[:2*padding+1]))
    window = actual[location:location+len(reference)]
    score = float(correlation[location] / np.sqrt(np.sum(reference**2)*np.sum(window**2)))
    return location-padding, score


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--work',type=Path,required=True)
    parser.add_argument('--edition',type=int,choices=[10,11],default=10)
    args = parser.parse_args(); work = args.work.resolve()
    spec = importlib.util.spec_from_file_location('v10_build',ROOT/'tools/film/scripts/build-prologue-v10.py')
    build = importlib.util.module_from_spec(spec); spec.loader.exec_module(build)
    exe = build.utility().ffmpeg_path(None)
    plan = load(ROOT/f'tools/film/scripts/prologue-edit-v{args.edition}.json'); narration = load(work/'narration/manifest.json')
    audio_report = load(work/'audio-report.json'); assert audio_report['complete']
    index = {s['id']:s for s in plan['shots']}
    protected = [(111.5,113,'V2 reading pause'),(index['moon-flag']['start'],index['moon-flag']['end'],'flag music only'),(153,161,'Gagarin music only')]
    for start,end,name in protected:
        for row in narration['lines']:
            assert not (row['at'] < end and row['end'] > start),(name,row['id'])
        for row in plan['archivalAudio']:
            assert not (row['at'] < end and row['at']+row['length'] > start),(name,row['id'])
    measurements = []
    for language in ['en','fr']:
        directory = work/f'v{args.edition}-0-hd50'/f'audio-{language}'
        output = work/f'verified-delivery-{language}.f32'; receipt = output.with_suffix('.json')
        signature = audio_report['languages'][language]['masterSha256']
        if not (output.is_file() and receipt.is_file() and load(receipt).get('masterSha256') == signature):
            build.run(exe,'-i',directory/'index.m3u8','-vn','-ar',RATE,'-ac',2,'-f','f32le',output)
            build.write(receipt,{'masterSha256':signature})
        actual = np.memmap(output,dtype='<f4',mode='r').reshape(-1,2)
        for row in [r for r in narration['lines'] if r['language'] == language]:
            reference = build.decoded(exe,work/row['file'],work/'narration'/(row['id']+'-'+language+'.f32'))
            count = min(len(reference),round(1.8*RATE)); pad = round(.15*RATE); at = round(row['at']*RATE)
            first = reference[:count].mean(axis=1)
            window = actual[at-pad:at+count+pad].mean(axis=1)
            lag,score = correlate(first,window,pad)
            assert abs(lag) <= 240 and score > .8,(language,row['id'],lag,score)
            measurements.append({'id':row['id'],'language':language,'at':row['at'],'lagSamples':lag,
                                 'lagSeconds':round(lag/RATE,6),'waveformCorrelation':round(score,6)})
        print(json.dumps({'language':language,'paragraphsVerified':len([r for r in measurements if r['language']==language])}),flush=True)
    report = {'revision':plan['revision'],'duration':plan['duration'],'passed':True,
              'method':'Cross-correlation of each actual delivered AAC paragraph onset against its rendered PCM stock narration; search ±150 ms, maximum allowed error 5 ms.',
              'paragraphs':measurements,'protectedMusicOnlyIntervals':[{'start':a,'end':b,'name':name} for a,b,name in protected],
              'maximumAbsoluteLagSamples':max(abs(r['lagSamples']) for r in measurements)}
    build.write(work/'alignment-report.json',report)
    print(json.dumps({'passed':True,'paragraphs':len(measurements),'maximumAbsoluteLagSamples':report['maximumAbsoluteLagSamples']}),flush=True)


if __name__ == '__main__':
    main()
