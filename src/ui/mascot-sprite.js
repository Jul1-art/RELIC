const directions = {
  front: { width: 311, height: 492, shoulder: 240, waist: 356, left: 91, right: 220, split: 155 },
  front_left: { width: 296, height: 503, shoulder: 251, waist: 369, left: 85, right: 204, split: 143 },
  front_right: { width: 301, height: 489, shoulder: 240, waist: 353, left: 90, right: 226, split: 170 },
  left_profile: { width: 274, height: 501, waist: 379, split: 119, profile: true },
  right_profile: { width: 268, height: 489, waist: 372, split: 148, profile: true },
  back: { width: 313, height: 504, shoulder: 239, waist: 368, left: 88, right: 222, split: 157 },
  back_left: { width: 295, height: 501, shoulder: 239, waist: 367, left: 94, right: 219, split: 151 },
  back_right: { width: 296, height: 489, shoulder: 226, waist: 357, left: 80, right: 212, split: 149 },
};

const spriteURL = direction => new URL('../../assets/mascot/' + direction + '.png', import.meta.url).href;

/** A visual rig only. The companion controller owns movement and positioning. */
export function createMascotSprite() {
  const element = document.createElement('span');
  element.className = 'relic-mascot-sprite';
  element.setAttribute('aria-hidden', 'true');

  const figure = document.createElement('span');
  figure.className = 'mascot-sprite-figure';
  const layers = Object.fromEntries(['still', 'far-leg', 'near-leg', 'torso', 'left-arm', 'right-arm'].map(name => {
    const layer = document.createElement('span');
    layer.className = 'mascot-sprite-layer mascot-sprite-' + name;
    figure.append(layer);
    return [name, layer];
  }));
  element.append(figure);

  const preloaded = new Map();
  let request = 0;
  let shownDirection = 'front';

  function applyDirection(direction) {
    const {width, height, shoulder, waist, left, right, split, profile} = directions[direction];
    const point = ([x, y]) => (100 * x / width).toFixed(2) + '% ' + (100 * y / height).toFixed(2) + '%';
    const mask = (layer, points, joint) => {
      layers[layer].style.clipPath = 'polygon(' + points.map(point).join(',') + ')';
      if (joint) layers[layer].style.transformOrigin = point(joint);
    };

    // Overlap the moving pieces at the shoulders and hips to keep the joints
    // connected at the extremes of each step.
    const legTop = waist - (profile ? 8 : 28);
    const farLeg = profile
      ? [[0, legTop], [width, legTop], [width, height], [0, height]]
      : [[left + 5, legTop], [split, legTop], [split, height], [0, height], [0, waist + 20], [left - 16, waist + 20]];
    const nearLeg = profile
      ? farLeg
      : [[split, legTop], [right - 5, legTop], [right + 16, waist + 20], [width, waist + 20], [width, height], [split, height]];
    mask('far-leg', farLeg, [profile ? split : split - 45, waist - 12]);
    mask('near-leg', nearLeg, [profile ? split : split + 45, waist - 12]);

    const torso = profile
      ? [[0, 0], [width, 0], [width, waist], [0, waist]]
      : [[0, 0], [width, 0], [width, shoulder], [right, shoulder], [right - 5, waist], [left + 5, waist], [left, shoulder], [0, shoulder]];
    mask('torso', torso);
    if (!profile) {
      const cuff = waist + 17;
      mask('left-arm', [[0, shoulder], [left + 4, shoulder], [left + 5, cuff], [0, cuff]], [left - 16, shoulder + 8]);
      mask('right-arm', [[right - 4, shoulder], [width, shoulder], [width, cuff], [right - 5, cuff]], [right + 16, shoulder + 8]);
    }
    element.dataset.profile = String(Boolean(profile));
    element.dataset.direction = direction;
    element.style.setProperty('--mascot-source-ratio', width + ' / ' + height);
    element.style.setProperty('--mascot-source', 'url("' + spriteURL(direction) + '")');
    shownDirection = direction;
  }

  async function setPose(direction, state) {
    if (!Object.hasOwn(directions, direction)) return false;
    const current = ++request;
    if (shownDirection !== direction) {
      if (!preloaded.has(direction)) {
        const image = new Image();
        image.src = spriteURL(direction);
        preloaded.set(direction, image.decode().then(() => true, () => {
          preloaded.delete(direction);
          return false;
        }));
      }
      if (!await preloaded.get(direction) || current !== request) return false;
      applyDirection(direction);
    }
    element.dataset.state = state;
    return true;
  }

  applyDirection('front');
  setPose('front', 'idle');
  return {element, setPose};
}
