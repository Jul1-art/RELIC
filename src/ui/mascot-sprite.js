const DIRECTIONS = {
  front: '311 / 492',
  front_left: '296 / 503',
  front_right: '301 / 489',
  left_profile: '274 / 501',
  right_profile: '268 / 489',
  back: '313 / 504',
  back_left: '295 / 501',
  back_right: '296 / 489',
};
const FRAME_COUNT = 8;
const CELL_WIDTH = 172;
const FRAME_WIDTH = 118;
const FRAME_HEIGHT = 184;
const spriteURL = name => new URL(`../../assets/mascot/${name}.png`, import.meta.url).href;
let walkAtlas;

async function decode(name) {
  const image = new Image();
  image.src = spriteURL(name);
  await image.decode();
  return image;
}

// Key out the pale background connected to the crop edges. Enclosed white
// details on the helmet and suit remain opaque. The supplied sheet stays intact.
function removeBackground(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  const rgba = image.data;
  const queue = new Int32Array(width * height);
  let tail = 0;
  function visit(index) {
    const i = index * 4;
    if (!rgba[i + 3]) return;
    const min = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
    const max = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (min < 230 || max - min > 18) return;
    rgba[i + 3] = 0;
    queue[tail++] = index;
  }
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  for (let head = 0; head < tail; head++) {
    const index = queue[head];
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < queue.length) visit(index + width);
  }
  context.putImageData(image, 0, 0);
}

function loadWalkAtlas() {
  walkAtlas ??= decode('walk-sheet').then(image => {
    const atlas = document.createElement('canvas');
    atlas.width = image.width;
    atlas.height = FRAME_HEIGHT;
    const context = atlas.getContext('2d');
    // The second row is the complete lateral walk. All eight poses share a baseline.
    context.drawImage(image, 0, 201, atlas.width, atlas.height, 0, 0, atlas.width, atlas.height);
    removeBackground(context, atlas.width, atlas.height);
    return atlas;
  }).catch(() => {
    walkAtlas = undefined;
    return null;
  });
  return walkAtlas;
}

export function createMascotSprite() {
  const element = document.createElement('span');
  element.className = 'relic-mascot-sprite';
  element.setAttribute('aria-hidden', 'true');
  const figure = document.createElement('span');
  figure.className = 'mascot-sprite-figure';
  const still = document.createElement('span');
  still.className = 'mascot-sprite-still';
  const walk = document.createElement('canvas');
  walk.className = 'mascot-sprite-walk';
  walk.width = FRAME_WIDTH;
  walk.height = FRAME_HEIGHT;
  figure.append(still, walk);
  element.append(figure);

  const preloaded = new Map();
  let request = 0, atlas, frame = -1, stillDirection;

  function applyDirection(direction) {
    stillDirection = direction;
    element.dataset.direction = direction;
    still.style.aspectRatio = DIRECTIONS[direction];
    still.style.backgroundImage = `url("${spriteURL(direction)}")`;
  }

  function setPose(direction, state) {
    const current = ++request;
    element.dataset.state = state;
    if (!Object.hasOwn(DIRECTIONS, direction)) return;
    element.dataset.direction = stillDirection;
    if (direction === stillDirection) return;
    if (!preloaded.has(direction)) {
      preloaded.set(direction, decode(direction).then(() => true, () => {
        preloaded.delete(direction);
        return false;
      }));
    }
    preloaded.get(direction).then(loaded => {
      if (loaded && request === current) applyDirection(direction);
    });
  }

  function drawWalk(cycles) {
    const next = Math.floor(cycles * FRAME_COUNT) % FRAME_COUNT;
    if (next === frame) return;
    frame = next;
    const context = walk.getContext('2d');
    context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const sourceX = next * CELL_WIDTH + (CELL_WIDTH - FRAME_WIDTH) / 2;
    context.drawImage(atlas, sourceX, 0, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  }

  async function prepareWalk(right) {
    const current = ++request;
    const decoded = await loadWalkAtlas();
    if (!decoded || request !== current || !walk.getContext('2d')) return false;
    atlas = decoded;
    frame = -1;
    walk.style.transform = right ? '' : 'scaleX(-1)';
    element.dataset.direction = right ? 'right_profile' : 'left_profile';
    drawWalk(0);
    element.dataset.state = 'walking';
    return true;
  }

  applyDirection('front');
  element.dataset.state = 'idle';
  return {element, setPose, prepareWalk, drawWalk};
}
