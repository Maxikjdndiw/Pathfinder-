/**
 * Final compositing pass of the 3D hero.
 *
 * 1. Paints the stone background and the two ambient glows (oxblood, ocean),
 *    so the glass has real colour to bend, not just the cards.
 * 2. Lays the rendered card scene on top.
 * 3. Fades the bottom of the canvas into --stone (always a little, fully at the
 *    end of the hero) so the section never ends in a hard cut.
 * 4. Draws up to four "liquid glass" panels exactly where their HTML elements
 *    sit: the content behind is magnified and bent (strongest at the curved rim),
 *    lightly frosted in the middle, with a chromatic fringe only at the rim and a
 *    thin specular highlight on the top edge that follows the pointer.
 */
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Texture, Vector2, Vector4 } from 'three';

export const MAX_PANELS = 4;

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tScene;
  uniform vec2  uRes;       // canvas size in CSS px
  uniform float uDpr;
  uniform float uTime;
  uniform float uFade;      // 0..1 extra bottom fade at the end of the hero
  uniform float uShift;     // scroll stage, moves the highlight a little
  uniform vec2  uPointer;   // CSS px, relative to the canvas
  uniform vec4  uRect[${MAX_PANELS}];  // x, y (top-left, y down), w, h in CSS px
  uniform vec4  uInfo[${MAX_PANELS}];  // radius, strength (opacity), tint, -
  uniform int   uCount;

  const vec3 STONE = vec3(0.9098, 0.9059, 0.8902);   // #E8E7E3
  const vec3 CARD  = vec3(0.9569, 0.9490, 0.9333);   // #F4F2EE
  const vec3 OX    = vec3(0.4157, 0.0745, 0.0667);   // #6A1311
  const vec3 OC    = vec3(0.0353, 0.4118, 0.5882);   // #096996

  float glow(vec2 p, vec2 c, float r) {
    float d = clamp(1.0 - length(p - c) / r, 0.0, 1.0);
    return d * d * (3.0 - 2.0 * d);
  }

  vec3 background(vec2 p) {
    float vw = uRes.x / 100.0;
    vec2 ca = vec2(17.0 * vw, 13.0 * vw) + vec2(sin(uTime * 0.27), cos(uTime * 0.21)) * 3.0 * vw;
    vec2 cb = vec2(uRes.x - 14.0 * vw, uRes.y - 6.0 * vw) + vec2(cos(uTime * 0.23), sin(uTime * 0.29)) * 3.0 * vw;
    vec3 c = STONE;
    c = mix(c, OX, 0.20 * glow(p, ca, 35.0 * vw));
    c = mix(c, OC, 0.16 * glow(p, cb, 30.0 * vw));
    return c;
  }

  float fadeAt(vec2 p) {
    float y = p.y / uRes.y;
    float base = smoothstep(0.90, 1.0, y);
    float end  = uFade * smoothstep(0.40, 0.92, y);
    return max(base, end);
  }

  vec3 sampleAll(vec2 p) {
    vec2 uv = clamp(vec2(p.x / uRes.x, 1.0 - p.y / uRes.y), 0.0005, 0.9995);
    vec4 s = texture2D(tScene, uv);              // premultiplied cards
    vec3 c = background(p) * (1.0 - s.a) + s.rgb;
    return mix(c, STONE, fadeAt(p));
  }

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
    vec3 col = sampleAll(p);

    for (int i = 0; i < ${MAX_PANELS}; i++) {
      if (i >= uCount) break;
      vec4 R = uRect[i];
      vec4 I = uInfo[i];
      vec2 hs = R.zw * 0.5;
      vec2 c = R.xy + hs;
      float rad = min(I.x, min(hs.x, hs.y));
      vec2 lp = p - c;

      // soft contact shadow below the glass
      float ds = sdRoundRect(lp - vec2(0.0, 12.0), hs, rad);
      col *= 1.0 - I.y * 0.07 * (1.0 - smoothstep(-6.0, 30.0, ds));

      float d = sdRoundRect(lp, hs, rad);
      if (d > 1.5) continue;

      // outward normal of the rim (gradient of the distance field)
      vec2 n = vec2(
        sdRoundRect(lp + vec2(1.0, 0.0), hs, rad) - sdRoundRect(lp - vec2(1.0, 0.0), hs, rad),
        sdRoundRect(lp + vec2(0.0, 1.0), hs, rad) - sdRoundRect(lp - vec2(0.0, 1.0), hs, rad)
      );
      n = normalize(n + 1e-5);

      float t = max(-d, 0.0);                          // px inside the rim
      float bevel = max(8.0, min(rad * 1.15, min(hs.x, hs.y) * 0.95));
      float k = 1.0 - clamp(t / bevel, 0.0, 1.0);      // 1 at the rim, 0 in the calm middle
      float bend = k * k;
      float amp = min(26.0, bevel * 1.3);

      // lens: slight magnification overall + strong bending at the rim
      vec2 sp = c + lp * 0.93 + n * bend * amp;

      // light frost, a touch stronger in the middle so text stays calm
      float br = 2.0 + 2.5 * (1.0 - k);
      vec3 g = sampleAll(sp) * 2.0;
      g += sampleAll(sp + vec2(br, 0.0));
      g += sampleAll(sp - vec2(br, 0.0));
      g += sampleAll(sp + vec2(0.0, br));
      g += sampleAll(sp - vec2(0.0, br));
      g += sampleAll(sp + vec2(br, br) * 0.7);
      g += sampleAll(sp - vec2(br, br) * 0.7);
      g += sampleAll(sp + vec2(br, -br) * 0.7);
      g += sampleAll(sp + vec2(-br, br) * 0.7);
      g /= 10.0;

      // chromatic split, only at the very rim
      float rim = smoothstep(0.55, 1.0, k);
      if (rim > 0.002) {
        float cs = rim * 7.0;
        g.r = mix(g.r, sampleAll(sp + n * cs).r, rim);
        g.b = mix(g.b, sampleAll(sp - n * cs).b, rim);
      }

      // a bit of saturation, then the milky tint that keeps text readable
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, 1.18);
      g = mix(g, CARD, I.z * (1.0 - 0.55 * rim));

      // specular: thin bright line on the top edge, moving with pointer / scroll
      vec2 L = normalize(vec2(clamp((uPointer.x - c.x) / max(hs.x, 1.0), -1.0, 1.0) * 0.7 + sin(uShift * 2.2) * 0.25, -1.0));
      float facing = max(dot(n, L), 0.0);
      float edge = 1.0 - smoothstep(0.0, 1.6, t);
      g += edge * (0.18 + 0.82 * pow(facing, 4.0)) * 0.85;
      g += (1.0 - smoothstep(0.0, 9.0, t)) * pow(max(-n.y, 0.0), 2.0) * 0.08;
      g -= edge * max(n.y, 0.0) * 0.07;                 // darker bottom hairline

      float aa = clamp(0.5 - d, 0.0, 1.0);
      col = mix(col, clamp(g, 0.0, 1.0), aa * I.y);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class GlassPass {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: ShaderMaterial;
  private readonly geometry = new PlaneGeometry(2, 2);

  constructor(sceneTexture: Texture) {
    this.material = new ShaderMaterial({
      uniforms: {
        tScene: { value: sceneTexture },
        uRes: { value: new Vector2(1, 1) },
        uDpr: { value: 1 },
        uTime: { value: 0 },
        uFade: { value: 0 },
        uShift: { value: 0 },
        uPointer: { value: new Vector2(-9999, 0) },
        uRect: { value: Array.from({ length: MAX_PANELS }, () => new Vector4()) },
        uInfo: { value: Array.from({ length: MAX_PANELS }, () => new Vector4()) },
        uCount: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get u() {
    return this.material.uniforms;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
