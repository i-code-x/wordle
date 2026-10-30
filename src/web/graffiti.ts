const FONT = '"Sedgwick Ave Display", "Permanent Marker", Impact, sans-serif';
const INK = '#120a22';

// Timeline in ms: the can sprays the fill, then the outline, shine and drips arrive.
const SPRAY_MS = 1300;
const OUTLINE: Span = [900, 1400];
const SOLID: Span = [1100, 1500];
const SHINE: Span = [1450, 1750];
const DRIP: Span = [1300, 2700];
const END_MS = 2800;

type Span = readonly [number, number];

interface Drip {
  x: number;
  y: number;
  length: number;
  width: number;
}

const ramp = (t: number, [a, b]: Span) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/**
 * Spray-paint `text` onto the canvas like a graffiti piece: a nozzle zig-zags across the
 * letters leaving speckled paint and overspray, then the solid fill, dark outline, shine and
 * paint drips arrive. `instant` draws the finished piece (for reduced motion).
 * Returns a function that stops the animation.
 */
export function sprayGraffiti(
  canvas: HTMLCanvasElement,
  text: string,
  colors: readonly string[],
  instant: boolean,
): () => void {
  let raf = 0;
  let stopped = false;

  void (async () => {
    try {
      await document.fonts.load(`100px ${FONT}`, text);
    } catch {
      // Offline or blocked: the fallback fonts still look fine.
    }
    if (stopped) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fit the word to the wall.
    // A little letter spacing keeps thin strokes (like I) from merging into their neighbours.
    const spacing = (s: number) => `${Math.round(s * 0.05)}px`;
    let size = H * 0.58;
    ctx.font = `${size}px ${FONT}`;
    ctx.letterSpacing = spacing(size);
    const natural = ctx.measureText(text).width;
    if (natural > W * 0.84) size *= (W * 0.84) / natural;
    const font = `${size}px ${FONT}`;
    const letterSpacing = spacing(size);
    ctx.font = font;
    ctx.letterSpacing = letterSpacing;
    const textWidth = ctx.measureText(text).width;
    const cx = W / 2;
    const cy = H * 0.48;

    const layer = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c.getContext('2d', { willReadFrequently: true })!;
    };
    const letters = (c: CanvasRenderingContext2D, mode: 'fill' | 'stroke', lineWidth = 0, dx = 0, dy = 0) => {
      c.save();
      c.font = font;
      c.letterSpacing = letterSpacing;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = lineWidth;
      c.translate(cx + dx, cy + dy);
      c.rotate(-0.06);
      if (mode === 'fill') c.fillText(text, 0, 0);
      else c.strokeText(text, 0, 0);
      c.restore();
    };
    const paintGradient = (c: CanvasRenderingContext2D) => {
      const g = c.createLinearGradient(cx - textWidth / 2, 0, cx + textWidth / 2, 0);
      colors.forEach((color, i) => g.addColorStop(colors.length > 1 ? i / (colors.length - 1) : 0, color));
      return g;
    };

    // Fattened letter shapes; all paint is clipped to these.
    const mask = layer();
    mask.fillStyle = mask.strokeStyle = '#fff';
    letters(mask, 'fill');
    letters(mask, 'stroke', size * 0.06);

    // Drop shadow and dark outline that sit under the paint.
    const outline = layer();
    outline.strokeStyle = 'rgba(0,0,0,0.55)';
    letters(outline, 'stroke', size * 0.17, size * 0.05, size * 0.06);
    outline.strokeStyle = INK;
    letters(outline, 'stroke', size * 0.17);

    // Shine: the upper-left rim inside each letter.
    const shine = layer();
    shine.drawImage(mask.canvas, 0, 0);
    shine.globalCompositeOperation = 'destination-out';
    shine.drawImage(mask.canvas, size * 0.03, size * 0.035);

    const paint = layer();
    paint.fillStyle = paintGradient(paint);
    const composite = layer();
    const drips = findDrips(mask, W, H, cx, textWidth, size);

    const left = cx - textWidth / 2 - size * 0.1;
    const span = textWidth + size * 0.2;
    let sprayedTo = 0;
    const spray = (from: number, to: number) => {
      const steps = Math.max(1, Math.ceil((to - from) * 600));
      for (let s = 0; s < steps; s++) {
        const t = from + ((to - from) * s) / steps;
        const nx = left + span * t;
        const ny = cy + Math.sin(t * Math.PI * 16) * size * 0.36;
        for (let i = 0; i < 20; i++) {
          // Gaussian-ish scatter around the nozzle.
          const r = size * 0.1 * Math.sqrt(-2 * Math.log(Math.random() || 1e-6));
          const a = Math.random() * Math.PI * 2;
          paint.beginPath();
          paint.arc(nx + Math.cos(a) * r, ny + Math.sin(a) * r, (0.5 + Math.random() * 1.6) * dpr, 0, Math.PI * 2);
          paint.fill();
        }
      }
    };

    const draw = (elapsed: number) => {
      const t = Math.min(1, elapsed / SPRAY_MS);
      if (t > sprayedTo) {
        spray(sprayedTo, t);
        sprayedTo = t;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = easeOut(ramp(elapsed, OUTLINE));
      ctx.drawImage(outline.canvas, 0, 0);
      ctx.globalAlpha = 0.18; // overspray haze around the letters
      ctx.drawImage(paint.canvas, 0, 0);

      composite.globalCompositeOperation = 'source-over';
      composite.clearRect(0, 0, W, H);
      composite.drawImage(paint.canvas, 0, 0);
      const solid = ramp(elapsed, SOLID);
      if (solid > 0) {
        composite.globalAlpha = solid;
        composite.fillStyle = paintGradient(composite);
        composite.fillRect(0, 0, W, H);
        composite.globalAlpha = 1;
      }
      composite.globalCompositeOperation = 'destination-in';
      composite.drawImage(mask.canvas, 0, 0);

      ctx.globalAlpha = 1;
      ctx.drawImage(composite.canvas, 0, 0);
      ctx.globalAlpha = 0.75 * ramp(elapsed, SHINE);
      ctx.drawImage(shine.canvas, 0, 0);
      ctx.globalAlpha = 1;

      const grow = easeOut(ramp(elapsed, DRIP));
      if (grow > 0) drawDrips(ctx, drips, grow, paintGradient(ctx));
    };

    if (instant) {
      draw(END_MS);
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      if (stopped) return;
      const elapsed = now - start;
      draw(elapsed);
      if (elapsed < END_MS) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  })();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/** Pick a few columns and start a drip at the lowest painted pixel of each. */
function findDrips(
  mask: CanvasRenderingContext2D,
  W: number,
  H: number,
  cx: number,
  textWidth: number,
  size: number,
): Drip[] {
  const alpha = mask.getImageData(0, 0, W, H).data;
  const wanted = 6 + Math.floor(Math.random() * 4);
  const drips: Drip[] = [];
  for (let attempt = 0; attempt < wanted * 4 && drips.length < wanted; attempt++) {
    const x = Math.round(cx - textWidth / 2 + Math.random() * textWidth);
    if (x < 0 || x >= W) continue;
    for (let y = H - 1; y >= 0; y--) {
      if (alpha[(y * W + x) * 4 + 3]! > 200) {
        const room = H - y - size * 0.08;
        if (room > size * 0.15) {
          drips.push({
            x,
            y: y - size * 0.02,
            width: size * (0.025 + Math.random() * 0.03),
            length: Math.min(room, size * (0.15 + Math.random() * 0.4)),
          });
        }
        break;
      }
    }
  }
  return drips;
}

function drawDrips(ctx: CanvasRenderingContext2D, drips: Drip[], grow: number, paint: CanvasGradient): void {
  ctx.lineCap = 'round';
  for (const d of drips) {
    const end = d.y + d.length * grow;
    ctx.strokeStyle = INK;
    ctx.lineWidth = d.width * 1.6;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y + d.width);
    ctx.lineTo(d.x, end);
    ctx.stroke();

    ctx.strokeStyle = paint;
    ctx.lineWidth = d.width;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x, end);
    ctx.stroke();

    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.arc(d.x, end, d.width * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}
