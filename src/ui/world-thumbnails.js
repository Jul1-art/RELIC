let nextThumbnail=0;

/** Small navigation illustrations, kept distinct from the scientific 3D models. */
export function worldThumbnail(body){
  if(!['earth','saturn','67p'].includes(body))return '';
  const id=`world-mini-${++nextThumbnail}`;
  const svg=(viewBox,content)=>`<svg class="pd-world-mini" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`;
  if(body==='earth')return svg('0 0 32 32',`
    <defs><radialGradient id="${id}-sea" cx="32%" cy="25%" r="82%"><stop stop-color="#41b5ee"/><stop offset=".55" stop-color="#1266c5"/><stop offset="1" stop-color="#06234c"/></radialGradient><clipPath id="${id}-clip"><circle cx="16" cy="16" r="13.4"/></clipPath><linearGradient id="${id}-light"><stop stop-color="#fff" stop-opacity=".13"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#001027" stop-opacity=".5"/></linearGradient></defs>
    <circle cx="16" cy="16" r="14.4" fill="#54c8ff" fill-opacity=".18"/>
    <circle cx="16" cy="16" r="13.4" fill="url(#${id}-sea)"/>
    <g clip-path="url(#${id}-clip)">
      <path d="m5 6 4-2 3 1 1 3-2 2-3 1-1 3-3-2-2-3Zm4 8 3 1 2 3-1 4-2 4-2-4 1-3-2-3Z" fill="#78b982"/>
      <path d="m18 5 4-2 6 2 3 4-3 3-4-1-1 3-3-1-1-3-3 1-1-2Zm0 9 4 1 2 4-3 5-2-2-1-4-2-2Zm7 10 3-1 2 2-2 2-3-1Z" fill="#9ebc83"/>
      <path d="m18 15 4 1 1 2-4-1Z" fill="#d3bf83"/>
      <path d="M5 8q5-3 9-2M16 7q6-2 12 2M4 17q4 2 7 0M17 23q5 3 10 0" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M9 3q7-2 14 1M8 29q9 2 16-1" fill="none" stroke="#e5f7ff" stroke-width="2.4"/>
      <circle cx="16" cy="16" r="13.4" fill="url(#${id}-light)"/>
    </g><circle cx="16" cy="16" r="13.4" fill="none" stroke="#9adfff" stroke-opacity=".45" stroke-width=".5"/>
  `);
  if(body==='saturn')return svg('0 0 40 32',`
    <defs><radialGradient id="${id}-body" cx="30%" cy="20%" r="90%"><stop stop-color="#fff0c5"/><stop offset=".6" stop-color="#d5b47c"/><stop offset="1" stop-color="#79634c"/></radialGradient><clipPath id="${id}-clip"><circle cx="20" cy="16" r="10"/></clipPath></defs>
    <g transform="rotate(-23 20 16)">
      <ellipse cx="20" cy="16" rx="18" ry="6.4" fill="none" stroke="#b8a180" stroke-width="3.4"/>
      <ellipse cx="20" cy="16" rx="16.5" ry="6" fill="none" stroke="#ead8b5" stroke-width=".6"/>
      <circle cx="20" cy="16" r="10" fill="url(#${id}-body)"/>
      <g clip-path="url(#${id}-clip)" fill="none"><path d="M9 11q11 3 22 0M9 17q11 3 22 0M9 22q11 3 22 0" stroke="#9e825e" stroke-opacity=".38" stroke-width="1.5"/><path d="M9 14q11 3 22 0" stroke="#fff1cc" stroke-opacity=".6" stroke-width="1"/></g>
      <path d="M2 16a18 6.4 0 0 0 36 0" fill="none" stroke="#d3bd94" stroke-width="3.4"/>
      <path d="M2 16a18 6.4 0 0 0 36 0" fill="none" stroke="#f4e2bd" stroke-width=".7"/>
    </g>
  `);
  return svg('0 0 32 32',`
    <defs><linearGradient id="${id}-rock" x2=".85" y2="1"><stop stop-color="#ddd3bf"/><stop offset=".5" stop-color="#9d9487"/><stop offset="1" stop-color="#514b46"/></linearGradient></defs>
    <path d="M5 14 8 11 12 12 14 10 13 7 15 3 20 2 25 5 28 10 26 15 22 17 22 22 18 27 12 29 7 26 3 21Z" fill="url(#${id}-rock)" stroke="#49443f" stroke-width=".7" stroke-linejoin="round"/>
    <path d="m14 11 4 3 4 2-5 3-3 4-3-3 3-4Z" fill="#5b534a" fill-opacity=".65"/>
    <path d="m16 5 4-1 4 4-5 1ZM5 16l4-2 3 3-2 3-4-1Z" fill="#ece2ce" fill-opacity=".45"/>
    <path d="m7 23 3 2 4-1m3-2 2-2m2-9 2 1m-8-6 1 2" fill="none" stroke="#4f4942" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"/>
  `);
}
