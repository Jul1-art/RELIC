let nextMascotId = 0;

const FACINGS = {
  front: ['front', false],
  front_left: ['side', true],
  front_right: ['side', false],
  left_profile: ['side', true],
  right_profile: ['side', false],
  back: ['back', false],
  back_left: ['back', true],
  back_right: ['back', false],
};

function leg(x, paint, dark) {
  return `<path d="M${x - 7} 75h14v14H${x - 7}z" fill="#25354a"/>
    <path d="M${x - 6} 82h12l1 13q4 1 4 5v2q0 2-2 2H${x - 8}q-2 0-2-2v-2q0-3 3-5Z" fill="${paint}" stroke="#0c1421" stroke-width="2.3"/>
    <path d="M${x - 6} 91h12" fill="none" stroke="#4b92ad" stroke-width="2.8"/>
    <path d="M${x - 9} 101h19v2H${x - 9}z" fill="${dark}"/>
    <path d="M${x - 6} 97h10" stroke="#f6fbff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
}

function arm(paint, gold) {
  return `<path d="M24 56q-5 0-7 5l-3 12q-1 5 2 9l4 4q3 3 7 0l2-5q2-6 1-13Z" fill="${paint}" stroke="#0c1421" stroke-width="2.2"/>
    <path d="M20 60q3-4 7 0l2 4H18Z" fill="${gold}"/>
    <path d="M16 69h12v3H15Z" fill="#359ab8"/>
    <path d="M15 76h13v3q-1 7-6 7-6-1-7-6Z" fill="#28384d"/>`;
}

// A single articulated astronaut. All facings share the same helmet, suit and
// joint geometry, so direction changes do not swap the character's silhouette.
export function createMascotSprite() {
  const prefix = 'relic-suit-' + ++nextMascotId;
  const url = name => `url(#${prefix}-${name})`;
  const gold = url('gold'), suit = url('suit');
  const element = document.createElement('span');
  element.className = 'relic-mascot-sprite';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `<svg viewBox="0 0 84 110" xmlns="http://www.w3.org/2000/svg" class="mascot-suit" focusable="false">
  <defs>
    <linearGradient id="${prefix}-gold" x2=".65" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="#ffe387"/><stop offset=".48" stop-color="#f9b834"/><stop offset=".78" stop-color="#df8521"/><stop offset="1" stop-color="#9f4d1e"/>
    </linearGradient>
    <linearGradient id="${prefix}-suit" x2=".78" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="#f6f8ff"/><stop offset=".53" stop-color="#dbe6f5"/><stop offset="1" stop-color="#8297b4"/>
    </linearGradient>
    <linearGradient id="${prefix}-visor" x2=".44" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="#253b54"/><stop offset="1" stop-color="#081321"/>
    </linearGradient>
    <linearGradient id="${prefix}-face" x2=".32" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="#e4ab77"/><stop offset="1" stop-color="#a96d50"/>
    </linearGradient>
    <radialGradient id="${prefix}-glint">
      <stop stop-color="#e9fdff"/><stop offset=".29" stop-color="#5cecff" stop-opacity=".88"/><stop offset="1" stop-color="#20c7ed" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse class="mascot-suit-shadow" cx="42" cy="104" rx="24" ry="4" fill="#020713" opacity=".49"/>
  <g data-facing>
    <g data-body>
      <g class="mascot-suit-side">
        <path d="M29 50h-8q-6 1-6 7v19q0 6 6 6h10Z" fill="${suit}" stroke="#0c1421" stroke-width="2.3" />
        <path d="M19 58h4v17h-4Z" fill="#20354d"/><path d="M20 60h2v12h-2Z" fill="#45d4ef"/>
      </g>
      <g data-far-leg>${leg(51, suit, '#2b394b')}</g>
      <g data-far-arm><g transform="translate(84 0) scale(-1 1)">${arm(suit, gold)}</g></g>
      <g data-near-leg>${leg(34, suit, '#2b394b')}</g>
      <path d="M27 55h30l4 17q2 6-4 11H28q-6-5-4-11Z" fill="${suit}" stroke="#0c1421" stroke-width="2.5"/>
      <path d="M27 74h31l1 4-3 4H29l-4-4Z" fill="#3a4b65"/>
      <path d="M37 75h10q2 0 2 2v3H35v-3q0-2 2-2Z" fill="#7a90ad"/>
      <g class="mascot-suit-chest">
        <path d="M31 60h22l2 4v7l-5 3H34l-5-3v-7Z" fill="#283d56"/>
        <path d="M34 62h15v5H34Z" fill="#94b4c6"/>
        <path d="M35 63h7v3h-7Z" fill="#ffb341"/>
        <circle cx="48" cy="64.5" r="1.5" fill="#6aebf8"/>
        <path d="M36 70h12" stroke="#cfddf1" stroke-width="1.2" stroke-linecap="round"/>
      </g>
      <g class="mascot-suit-pack">
        <rect x="30" y="53" width="24" height="29" rx="4" fill="${suit}" stroke="#132033" stroke-width="2"/>
        <rect x="36" y="57" width="12" height="19" rx="2" fill="#24364e"/>
        <rect x="39" y="60" width="6" height="13" rx="1" fill="#27bfe4"/>
        <path d="M40 62v9" stroke="#a4f7ff" stroke-linecap="round" stroke-width="1.1"/>
      </g>
      <g data-near-arm>${arm(suit, gold)}</g>
      <g data-helmet>
        <path d="M14 43V33C14 17 24 7 42 7s28 10 28 26v10c0 13-10 21-28 21s-28-8-28-21Z" fill="${gold}" stroke="#0b1422" stroke-width="2.7"/>
        <path d="M35 9q7-2 14 0l2 18H33Z" fill="#eff4fd"/>
        <path d="M34 23h16l1 4H33Z" fill="#a9bed5"/>
        <path d="M21 25q2-8 10-12" fill="none" stroke="#fff1af" stroke-width="1.6" stroke-linecap="round" opacity=".78"/>
        <g class="mascot-suit-window">
          <path d="M18 32h48v10q0 15-24 17-24-2-24-17Z" fill="${url('visor')}" stroke="#7f461b" stroke-width="1.8"/>
          <g class="mascot-suit-face">
            <path d="M25 39q0-3 3-3h27q4 0 4 4v7q-2 9-17 9-16 0-17-9Z" fill="${url('face')}"/>
            <path class="mascot-suit-eye-far" d="M33 44v5" stroke="#182439" stroke-width="3" stroke-linecap="round"/>
            <path d="M51 44v5" stroke="#182439" stroke-width="3" stroke-linecap="round"/>
          </g>
          <path d="M21 37q6-4 17-3" fill="none" stroke="#8fdde9" stroke-width="1.15" stroke-linecap="round" opacity=".73"/>
          <circle cx="30" cy="39" r="7.4" fill="${url('glint')}"/>
          <path d="M30 37v4m-2-2h4" stroke="#ddfcff" stroke-width=".95" stroke-linecap="round"/>
          <path d="M18 30h48" fill="none" stroke="#ffd465" stroke-width="3.2" stroke-linecap="round"/>
        </g>
        <g class="mascot-suit-rear">
          <path d="M19 30h46v14q0 11-23 14-23-3-23-14Z" fill="#bc691f" stroke="#a7561b" stroke-width="1.8"/>
          <path d="M20 32h44v5H20Z" fill="#fbb839"/>
          <path d="M30 52q12 6 24 0" fill="none" stroke="#e39131" stroke-width="1.6" stroke-linecap="round"/>
        </g>
        <path d="M14 33h4v17h-4q-4-1-4-4v-9q0-3 4-4Z" fill="${suit}" stroke="#142135" stroke-width="1.7"/>
        <path d="M66 33h4q4 1 4 4v9q0 3-4 4h-4Z" class="mascot-suit-ear-far" fill="${suit}" stroke="#142135" stroke-width="1.7"/>
        <g class="mascot-suit-ear-side">
          <path d="M15 33h6q4 0 4 4v10q0 4-4 4h-6q-3 0-3-4V37q0-4 3-4Z" fill="${suit}" stroke="#142135" stroke-width="1.8"/>
          <path d="M17 37v10" stroke="#75abc0" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </g>
    </g>
  </g></svg>`;

  const facing = element.querySelector('[data-facing]');
  const body = element.querySelector('[data-body]');
  const helmet = element.querySelector('[data-helmet]');
  const nearLeg = element.querySelector('[data-near-leg]');
  const farLeg = element.querySelector('[data-far-leg]');
  const nearArm = element.querySelector('[data-near-arm]');
  const farArm = element.querySelector('[data-far-arm]');
  let pose;

  function drawWalk(cycles) {
    const phase = cycles * Math.PI * 2;
    const stride = Math.cos(phase);
    const nearLift = Math.max(0, Math.sin(phase)) * 3.8;
    const farLift = Math.max(0, -Math.sin(phase)) * 3.8;
    const bob = (1 - Math.cos(phase * 2)) * .47;
    const amplitude = pose === 'side' ? 14 : 7;
    body.setAttribute('transform', `translate(0 ${-bob})`);
    nearLeg.setAttribute('transform', `translate(0 ${-nearLift}) rotate(${amplitude * stride} 34 78)`);
    farLeg.setAttribute('transform', `translate(0 ${-farLift}) rotate(${-amplitude * stride} 51 78)`);
    nearArm.setAttribute('transform', `rotate(${-12 * stride} 24 58)`);
    farArm.setAttribute('transform', `rotate(${12 * stride} 59 58)`);
  }

  function setPose(direction, state) {
    const [view, mirrored] = FACINGS[direction] ?? FACINGS.front;
    pose = view;
    element.dataset.direction = direction;
    element.dataset.view = view;
    element.dataset.state = state;
    facing.setAttribute('transform', mirrored ? 'translate(84 0) scale(-1 1)' : '');
    helmet.setAttribute('transform', state === 'resting' ? 'translate(0 1.5) rotate(-2 42 57)' : '');
    if (state === 'walking') {
      drawWalk(0);
      return;
    }
    for (const joint of [body, nearLeg, farLeg, nearArm, farArm]) joint.removeAttribute('transform');
  }

  setPose('front', 'idle');
  return {element, setPose, drawWalk};
}
