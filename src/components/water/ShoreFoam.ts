import * as THREE from 'three'

/** Bake the island's real shoreline once; camera/boat depth never moves this field. */
export class ShoreFoam {
  readonly bounds = new THREE.Vector4(0, 0, 1, 1)
  readonly texture: THREE.DataTexture

  constructor() {
    this.texture = new THREE.DataTexture(new Float32Array([32, -64, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
  }

  bake(renderer: THREE.WebGLRenderer, island: THREE.Object3D) {
    const size = 256, padding = 12
    island.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(island)
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + padding * 2
    const minX = center.x - span / 2, minZ = center.z - span / 2
    const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, .1, box.max.y - box.min.y + 20)
    camera.position.set(center.x, box.max.y + 10, center.z)
    // The conventional top-down camera keeps world X pointing right.
    camera.up.set(0, 0, -1)
    camera.lookAt(center.x, box.min.y, center.z)
    const scene = new THREE.Scene()
    const copy = island.clone(true)
    copy.matrix.copy(island.matrixWorld)
    copy.matrixAutoUpdate = false
    copy.visible = true
    copy.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        if (materials.every(material => material.transparent || material.alphaTest > 0)) object.visible = false
      }
    })
    scene.add(copy)
    const material = new THREE.ShaderMaterial({
      vertexShader: 'varying float height; void main(){vec4 world=modelMatrix*vec4(position,1.);height=world.y;gl_Position=projectionMatrix*viewMatrix*world;}',
      fragmentShader: 'varying float height; void main(){gl_FragColor=vec4(height,0.,0.,1.);}',
      side: THREE.DoubleSide, toneMapped: false,
    })
    scene.overrideMaterial = material
    const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType })
    const pixels = new Float32Array(size * size * 4)
    const saved = {
      target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      clear: renderer.getClearColor(new THREE.Color()).clone(), alpha: renderer.getClearAlpha(),
      viewport: renderer.getViewport(new THREE.Vector4()).clone(), scissor: renderer.getScissor(new THREE.Vector4()).clone(),
      scissorTest: renderer.getScissorTest(),
    }
    try {
      renderer.setScissorTest(false)
      renderer.setRenderTarget(target)
      renderer.setClearColor(new THREE.Color(-64, 0, 0), 1)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    } finally {
      renderer.setRenderTarget(saved.target, saved.face, saved.mip)
      renderer.setClearColor(saved.clear, saved.alpha)
      renderer.setViewport(saved.viewport)
      renderer.setScissor(saved.scissor)
      renderer.setScissorTest(saved.scissorTest)
      target.dispose()
      material.dispose()
      // Copy shares original geometry/textures; only the temporary target/material are owned here.
      scene.clear()
    }
    // GPU rows go from +Z to -Z; the field uses increasing world Z for V.
    for (let y = 0; y < size / 2; y++) {
      for (let x = 0; x < size * 4; x++) {
        const a = y * size * 4 + x, b = (size - 1 - y) * size * 4 + x
        const value = pixels[a]!
        pixels[a] = pixels[b]!
        pixels[b] = value
      }
    }
    const land = new Float32Array(size * size), sea = new Float32Array(size * size)
    for (let i = 0; i < land.length; i++) {
      const dry = pixels[i * 4] >= 0
      land[i] = dry ? 0 : span
      sea[i] = dry ? span : 0
    }
    const cell = span / size, diagonal = cell * Math.SQRT2
    // Two-pass chamfer distance: sub-metre precision is enough for a porous surf band.
    for (const field of [land, sea]) {
      for (const forward of [true, false]) {
        const step = forward ? 1 : -1
        for (let y = forward ? 0 : size - 1; y >= 0 && y < size; y += step) {
          for (let x = forward ? 0 : size - 1; x >= 0 && x < size; x += step) {
            const i = y * size + x, previousX = x - step, previousY = y - step
            if (previousX >= 0 && previousX < size) field[i] = Math.min(field[i]!, field[y * size + previousX]! + cell)
            if (previousY >= 0 && previousY < size) {
              field[i] = Math.min(field[i]!, field[previousY * size + x]! + cell)
              for (const nx of [x - 1, x + 1]) if (nx >= 0 && nx < size) field[i] = Math.min(field[i]!, field[previousY * size + nx]! + diagonal)
            }
          }
        }
      }
    }
    for (let i = 0; i < land.length; i++) {
      pixels[i * 4 + 1] = pixels[i * 4]!
      pixels[i * 4] = land[i]! - sea[i]!
    }
    // Store the seaward direction alongside distance and terrain height. Foam
    // drifts with each stretch of coast instead of sliding across the whole island.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const dx = pixels[(y * size + Math.min(x + 1, size - 1)) * 4]! - pixels[(y * size + Math.max(x - 1, 0)) * 4]!
        const dz = pixels[(Math.min(y + 1, size - 1) * size + x) * 4]! - pixels[(Math.max(y - 1, 0) * size + x) * 4]!
        const length = Math.hypot(dx, dz) || 1
        pixels[i + 2] = dx / length
        pixels[i + 3] = dz / length
      }
    }
    this.bounds.set(minX, minZ, 1 / span, 1 / span)
    // The placeholder may already be uploaded before the model loads. Immutable
    // GPU texture storage must be released before changing its dimensions.
    this.texture.dispose()
    this.texture.image = { data: pixels, width: size, height: size }
    this.texture.needsUpdate = true
  }

  dispose() { this.texture.dispose() }
}

export const shoreFoamFragment = /* glsl */ `
uniform sampler2D uShoreField;
uniform vec4 uShoreBounds;
float shoreHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float shoreNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(shoreHash(i),shoreHash(i+vec2(1.,0.)),f.x),mix(shoreHash(i+vec2(0.,1.)),shoreHash(i+1.),f.x),f.y);
}
float shoreBubbles(vec2 p){
  vec2 cell=floor(p),f=fract(p);
  float nearest=2.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 offset=vec2(float(x),float(y));
    vec2 jitter=vec2(shoreHash(cell+offset),shoreHash(cell+offset+19.7));
    vec2 delta=offset+.15+jitter*.7-f;
    float radius=.55+.9*shoreHash(cell+offset+41.3);
    nearest=min(nearest,dot(delta,delta)/radius);
  }
  // Small clear bubbles in a connected frothy sheet; derivatives retain the
  // average coverage when these holes become smaller than a screen pixel.
  nearest+=(shoreNoise(p*2.7)-.5)*.07;
  float aa=max(fwidth(nearest),.012);
  return smoothstep(.035-aa,.15+aa,nearest);
}
float shorelineFoam(vec3 world,vec2 surface){
  vec2 uv=(world.xz-uShoreBounds.xy)*uShoreBounds.zw;
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))) return 0.;
  vec4 field=texture2D(uShoreField,uv);
  if(field.r>6.||field.r< -5.)return 0.;
  vec2 outward=field.ba/max(length(field.ba),.001);
  vec2 tangent=vec2(-outward.y,outward.x);
  vec2 coast=world.xz-outward*field.r;
  float phase=shoreNoise(coast*.14)*5.;
  float surge=sin(uTime*.8+phase);
  float d=field.r+world.y*.65+surge*.18;
  // Real terrain height makes the lip advance over the beach with the water
  // surface. The short distance fallback also covers steep rock faces.
  float depth=world.y-field.g;
  float shallow=(1.-smoothstep(.08,.62,depth))*smoothstep(-.12,.12,depth);
  float lip=exp(-pow((d-.15)/.55,2.));
  float edge=shoreNoise(world.xz*2.1+surge*.14);
  float extent=1.-smoothstep(1.65,3.5,d+(edge-.5)*.65);
  float wet=field.g> -32.?smoothstep(-.12,.08,depth):smoothstep(-.6,.05,d);
  vec2 p=surface-outward*(uTime*.1+surge*.22)-tangent*uTime*.035;
  p+=vec2(shoreNoise(p*.8),shoreNoise(p*.8+23.7))*.22;
  float patches=shoreNoise(p*.65);
  float flecks=shoreNoise(p*3.4+vec2(uTime*.06,-uTime*.04));
  float holes=shoreBubbles(p*5.2);
  float filaments=texture2D(uFoam,p*.14).r;
  float contact=max(shallow,lip*.72);
  // Dense, perforated foam at the waterline, breaking into isolated lace and
  // fading quickly offshore. No repeating parallel sine-wave rings.
  float wash=exp(-max(d,0.)*1.1)*smoothstep(.28,.64,patches)*(.35+.25*surge);
  float sheet=contact*smoothstep(.22,.52,patches)*holes;
  float residue=wash*max(holes*.48,filaments);
  float breakup=mix(smoothstep(.26,.56,flecks),1.,contact*.4);
  return clamp((sheet*.9+residue*.65)*breakup*wet*extent,0.,.88);
}
`
