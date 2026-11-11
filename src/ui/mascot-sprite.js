let nextMascotId = 0;

const FACINGS = {
  front: ['front', false],
  front_left: ['side', true],
  front_right: ['side', false],
  left_profile: ['side', true],
  right_profile: ['side', false],
  // The pixel-art pack has no rear views; Spacey always faces the explorer.
  back: ['front', false],
  back_left: ['side', true],
  back_right: ['side', false],
};

const SPRITE_RELEASE = 5;

const FRAMES = {
  front: new URL(`../../assets/spacey/spacey-front.png?v=${SPRITE_RELEASE}`, import.meta.url).href,
  side: new URL(`../../assets/spacey/spacey-side.png?v=${SPRITE_RELEASE}`, import.meta.url).href,
};

// One pixel-art astronaut. The front and three-quarter art share the same
// character, so direction changes keep a single consistent silhouette.
export function createMascotSprite() {
  const element = document.createElement('span');
  element.className = 'relic-mascot-sprite';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `<span class="mascot-suit" data-facing><span data-body><img class="mascot-suit-frame" data-frame="front" src="${FRAMES.front}" alt="" draggable="false"><img class="mascot-suit-frame" data-frame="side" src="${FRAMES.side}" alt="" draggable="false"></span></span><span class="mascot-suit-shadow" aria-hidden="true"></span>`;

  const facing = element.querySelector('[data-facing]');
  const body = element.querySelector('[data-body]');
  const frames = new Map(
    [...element.querySelectorAll('[data-frame]')].map(frame => [frame.dataset.frame, frame]),
  );

  function drawWalk(cycles, weight = 1) {
    weight = Math.max(0, Math.min(1, weight));
    const phase = cycles * Math.PI * 2;
    // The bitmap character swaps whole frames rather than articulating limbs;
    // a bob, sway and lean keep the march lively under the shared controller.
    const bob = (1 - Math.cos(phase * 2)) * 2.2 * weight;
    const sway = Math.sin(phase) * 2.4 * weight;
    body.style.transform = `translate(${sway.toFixed(2)}px ${(-bob).toFixed(2)}px) rotate(${(sway * .55).toFixed(2)}deg)`;
  }

  function setPose(direction, state) {
    const [view, mirrored] = FACINGS[direction] ?? FACINGS.front;
    element.dataset.direction = direction;
    element.dataset.view = view;
    element.dataset.state = state;
    for (const [name, frame] of frames) frame.hidden = name !== view;
    facing.style.transform = mirrored ? 'scaleX(-1)' : '';
    if (state !== 'walking') body.style.transform = '';
  }

  setPose('front', 'idle');
  return { element, setPose, drawWalk };
}
