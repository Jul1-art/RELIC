let nextThumbnail=0;

/** Archive photographs for Earth and Saturn; a navigation illustration for 67P. */
export function worldThumbnail(body){
  if(!['earth','saturn','67p'].includes(body))return '';
  const id=`world-mini-${++nextThumbnail}`;
  const svg=(viewBox,content)=>`<svg class="pd-world-mini" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`;
  if(body==='earth')return svg('0 0 32 32',`
    <defs><clipPath id="${id}-photo"><circle cx="16" cy="16" r="15"/></clipPath></defs>
    <image href="${new URL('../../assets/ui/worlds/earth-apollo17.jpg',import.meta.url).href}" x="-3" y="-3" width="38" height="38" clip-path="url(#${id}-photo)"/>
  `);
  if(body==='saturn')return svg('0 0 44 32',`
    <defs><clipPath id="${id}-photo"><circle cx="22.3" cy="16.2" r="8"/><ellipse cx="22" cy="15.95" rx="19.1" ry="2.05"/></clipPath></defs>
    <image href="${new URL('../../assets/ui/worlds/saturn-cassini.jpg',import.meta.url).href}" x="0" y="0" width="44" height="32" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id}-photo)"/>
  `);
  return svg('0 0 32 32',`
    <defs><linearGradient id="${id}-rock" x2=".85" y2="1"><stop stop-color="#ddd3bf"/><stop offset=".5" stop-color="#9d9487"/><stop offset="1" stop-color="#514b46"/></linearGradient></defs>
    <path d="M5 14 8 11 12 12 14 10 13 7 15 3 20 2 25 5 28 10 26 15 22 17 22 22 18 27 12 29 7 26 3 21Z" fill="url(#${id}-rock)" stroke="#49443f" stroke-width=".7" stroke-linejoin="round"/>
    <path d="m14 11 4 3 4 2-5 3-3 4-3-3 3-4Z" fill="#5b534a" fill-opacity=".65"/>
    <path d="m16 5 4-1 4 4-5 1ZM5 16l4-2 3 3-2 3-4-1Z" fill="#ece2ce" fill-opacity=".45"/>
    <path d="m7 23 3 2 4-1m3-2 2-2m2-9 2 1m-8-6 1 2" fill="none" stroke="#4f4942" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"/>
  `);
}
