import * as THREE from 'three';

const SHADER_KEY = 'cube-transmission-v1';

export class CubeTransmissionMaterial extends THREE.MeshPhysicalMaterial {
  constructor({
    blueNoiseTexture = null,
    transmissionTexture = null,
    mouseFrostTexture = null,
    trianglesTexture = null,
    frostColor = '#83a1c5',
    ...parameters
  } = {}) {
    super({
      color: '#e0e8ef',
      roughness: 0.65,
      metalness: 0.08,
      envMapIntensity: 0.91,
      reflectivity: 0.3,
      ior: 1.18,
      transmission: 0,
      transparent: true,
      ...parameters
    });

    this.shader = null;
    this.uniforms = {
      tTransmissionSamplerMap: { value: transmissionTexture },
      tBlue: { value: blueNoiseTexture },
      tMouseFrost: { value: mouseFrostTexture },
      tTriangles: { value: trianglesTexture },
      uTransmissionSamplerSize: { value: new THREE.Vector2(1, 1) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uBlueOffset: { value: new THREE.Vector2(0, 0) },
      uChromaticAberration: { value: 0.055 },
      uColorFrost: { value: new THREE.Color(frostColor) }
    };

    this.onBeforeCompile = (shader) => {
      this.shader = shader;
      shader.uniforms = {
        ...shader.uniforms,
        ...this.uniforms
      };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <uv_pars_vertex>',
          `
          varying vec2 vCubeUv;
          #include <uv_pars_vertex>
          `
        )
        .replace(
          '#include <uv_vertex>',
          `
          #include <uv_vertex>
          vCubeUv = uv;
          `
        );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <uv_pars_fragment>',
        `
        varying vec2 vCubeUv;
        #include <uv_pars_fragment>
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>

        uniform sampler2D tTransmissionSamplerMap;
        uniform sampler2D tBlue;
        uniform sampler2D tMouseFrost;
        uniform sampler2D tTriangles;
        uniform vec2 uTransmissionSamplerSize;
        uniform vec2 uResolution;
        uniform vec2 uBlueOffset;
        uniform float uChromaticAberration;
        uniform vec3 uColorFrost;

        vec4 getBlueNoise(vec2 fragCoord, vec2 offset) {
          return texture2D(tBlue, fract(fragCoord / 128.0 + offset));
        }

        vec3 sampleTransmission(vec2 uv, vec2 distortion) {
          vec2 clampedUv = clamp(uv, vec2(0.001), vec2(0.999));
          vec2 redUv = clamp(clampedUv + distortion * (1.0 + uChromaticAberration), vec2(0.001), vec2(0.999));
          vec2 greenUv = clamp(clampedUv + distortion, vec2(0.001), vec2(0.999));
          vec2 blueUv = clamp(clampedUv + distortion * (1.0 - uChromaticAberration), vec2(0.001), vec2(0.999));

          return vec3(
            texture2D(tTransmissionSamplerMap, redUv).r,
            texture2D(tTransmissionSamplerMap, greenUv).g,
            texture2D(tTransmissionSamplerMap, blueUv).b
          );
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `
        vec2 frostUv = fract(vCubeUv);
        vec2 mouseFrostData = texture2D(tMouseFrost, frostUv).rg;
        float mouseFrost = mouseFrostData.r;
        float mouseFrostRim = mouseFrostData.g;
        float triangleScale = 9.0 * min(1.0, uResolution.y / 1300.0);
        float trianglePattern = texture2D(tTriangles, fract(vCubeUv * triangleScale)).r;
        vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        vec4 blueNoise = getBlueNoise(gl_FragCoord.xy, uBlueOffset);
        float distortionNoise = (blueNoise.r - 0.5) * 0.03;
        vec2 distortion = normal.xy * (0.085 + roughnessFactor * (1.0 - mouseFrost * 0.65) * 0.14);
        distortion += mouseFrost * 0.025;
        distortion += vec2(distortionNoise, (blueNoise.g - 0.5) * 0.02);

        float fresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
        vec3 transmitted = sampleTransmission(screenUv, distortion * (1.0 - fresnel * 0.2));
        vec3 shellTint = diffuseColor.rgb * (0.12 + fresnel * 0.18);
        vec3 frostGlow = uColorFrost * mouseFrostRim;
        frostGlow += uColorFrost * trianglePattern * mouseFrostRim * 1.75;
        frostGlow += vec3(trianglePattern * mouseFrost * mouseFrost * 0.35);
        vec3 outgoingLight = mix(
          totalDiffuse + totalSpecular + totalEmissiveRadiance,
          transmitted + shellTint + totalSpecular * 0.45 + totalEmissiveRadiance + frostGlow,
          0.56
        );
        outgoingLight = clamp(outgoingLight, vec3(0.0), vec3(1.0));
        `
      );
    };
  }

  customProgramCacheKey() {
    return `${typeof super.customProgramCacheKey === 'function' ? super.customProgramCacheKey() : 'physical'}|${SHADER_KEY}`;
  }

  setBlueNoiseTexture(texture) {
    this.uniforms.tBlue.value = texture;
    if (this.shader) {
      this.shader.uniforms.tBlue.value = texture;
    }
  }

  setMouseFrostTexture(texture) {
    this.uniforms.tMouseFrost.value = texture;
    if (this.shader) {
      this.shader.uniforms.tMouseFrost.value = texture;
    }
  }

  setTrianglesTexture(texture) {
    this.uniforms.tTriangles.value = texture;
    if (this.shader) {
      this.shader.uniforms.tTriangles.value = texture;
    }
  }

  setFrostColor(color) {
    this.uniforms.uColorFrost.value.set(color);
    if (this.shader) {
      this.shader.uniforms.uColorFrost.value.set(color);
    }
  }

  setTransmissionTexture(texture, width = 1, height = 1) {
    this.uniforms.tTransmissionSamplerMap.value = texture;
    this.uniforms.uTransmissionSamplerSize.value.set(width, height);

    if (this.shader) {
      this.shader.uniforms.tTransmissionSamplerMap.value = texture;
      this.shader.uniforms.uTransmissionSamplerSize.value.set(width, height);
    }
  }

  setResolution(width = 1, height = 1) {
    this.uniforms.uResolution.value.set(width, height);
    if (this.shader) {
      this.shader.uniforms.uResolution.value.set(width, height);
    }
  }

  setBlueOffset(x = 0, y = 0) {
    this.uniforms.uBlueOffset.value.set(x, y);
    if (this.shader) {
      this.shader.uniforms.uBlueOffset.value.set(x, y);
    }
  }

  copy(source) {
    super.copy(source);
    this.uniforms.tTransmissionSamplerMap.value = source.uniforms.tTransmissionSamplerMap.value;
    this.uniforms.tBlue.value = source.uniforms.tBlue.value;
    this.uniforms.tMouseFrost.value = source.uniforms.tMouseFrost.value;
    this.uniforms.tTriangles.value = source.uniforms.tTriangles.value;
    this.uniforms.uTransmissionSamplerSize.value.copy(source.uniforms.uTransmissionSamplerSize.value);
    this.uniforms.uResolution.value.copy(source.uniforms.uResolution.value);
    this.uniforms.uBlueOffset.value.copy(source.uniforms.uBlueOffset.value);
    this.uniforms.uChromaticAberration.value = source.uniforms.uChromaticAberration.value;
    this.uniforms.uColorFrost.value.copy(source.uniforms.uColorFrost.value);
    return this;
  }
}
