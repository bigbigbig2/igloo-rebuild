import * as THREE from 'three';

const SHADER_KEY = 'cube-transmission-v2';

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
      roughness: 0.53,
      metalness: 0.02,
      envMapIntensity: 0.84,
      reflectivity: 0.18,
      ior: 1.21,
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
      uChromaticAberration: { value: 0.038 },
      uColorFrost: { value: new THREE.Color(frostColor) },
      uThickness: { value: 0.92 },
      uAttenuationDistance: { value: 2.6 },
      uAttenuationColor: { value: new THREE.Color('#f5f9ff') }
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
          varying vec3 vWorldPositionCustom;
          #include <uv_pars_vertex>
          `
        )
        .replace(
          '#include <uv_vertex>',
          `
          #include <uv_vertex>
          vCubeUv = uv;
          `
        )
        .replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vWorldPositionCustom = worldPosition.xyz;
          `
        );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <uv_pars_fragment>',
        `
        varying vec2 vCubeUv;
        varying vec3 vWorldPositionCustom;
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
        uniform float uThickness;
        uniform float uAttenuationDistance;
        uniform vec3 uAttenuationColor;
        uniform mat4 modelMatrix;
        uniform mat4 projectionMatrix;

        vec4 getBlueNoise(vec2 fragCoord, vec2 offset) {
          return texture2D(tBlue, fract(fragCoord / 128.0 + offset));
        }

        vec4 sampleTransmissionBuffer(vec2 uv) {
          vec2 clampedUv = clamp(uv, vec2(0.001), vec2(0.999));
          return texture2D(tTransmissionSamplerMap, clampedUv);
        }

        vec3 volumeAttenuation(float transmissionDistance, vec3 attenuationColor, float attenuationDistance) {
          if (attenuationDistance <= 0.0 || attenuationDistance > 99999.0) {
            return vec3(1.0);
          }

          vec3 attenuationCoefficient = -log(max(attenuationColor, vec3(0.0001))) / attenuationDistance;
          return exp(-attenuationCoefficient * transmissionDistance);
        }

        vec3 getVolumeTransmissionRayCustom(vec3 n, vec3 v, float thicknessValue, float iorValue) {
          vec3 refractionVector = refract(-v, normalize(n), 1.0 / max(iorValue, 1.0001));
          vec3 modelScale;
          modelScale.x = length(vec3(modelMatrix[0].xyz));
          modelScale.y = length(vec3(modelMatrix[1].xyz));
          modelScale.z = length(vec3(modelMatrix[2].xyz));
          return normalize(refractionVector) * thicknessValue * modelScale;
        }

        vec4 sampleTransmission(vec3 n, vec3 v, vec3 position, float roughnessValue, float iorValue, float thicknessValue, vec2 jitter) {
          vec3 transmissionRay = getVolumeTransmissionRayCustom(n, v, thicknessValue, iorValue);
          vec3 refractedRayExit = position + transmissionRay;
          vec4 ndcPos = projectionMatrix * viewMatrix * vec4(refractedRayExit, 1.0);
          vec2 refractionCoords = ndcPos.xy / max(ndcPos.w, 0.0001);
          refractionCoords = refractionCoords * 0.5 + 0.5;
          refractionCoords += jitter * (0.0025 + roughnessValue * roughnessValue * 0.012);
          vec4 transmitted = sampleTransmissionBuffer(refractionCoords);
          transmitted.rgb *= volumeAttenuation(length(transmissionRay), uAttenuationColor, uAttenuationDistance);
          return transmitted;
        }

        vec3 sampleChromaticTransmission(vec3 n, vec3 v, vec3 position, float roughnessValue, float mouseFrostValue) {
          vec4 noise = getBlueNoise(gl_FragCoord.xy, uBlueOffset);
          vec4 noise2 = getBlueNoise(gl_FragCoord.xy + vec2(8.4, 9.6), uBlueOffset * vec2(1.34, 34.32));
          vec3 distortionNormal = normalize(noise2.xyz * 2.0 - 1.0);
          distortionNormal *= roughnessValue * roughnessValue * 1.25;
          distortionNormal += vec3(mouseFrostValue * 0.02);
          vec3 sampleNorm = normalize(n + distortionNormal);
          float thicknessSmear = uThickness * pow(max(roughnessValue, 0.0001), 0.25) * 0.72;

          vec4 transmissionR = sampleTransmission(
            sampleNorm,
            v,
            position,
            roughnessValue,
            ior,
            uThickness + thicknessSmear * (0.25 + noise.g * 0.75),
            vec2(noise.r - 0.5, noise.g - 0.5)
          );
          vec4 transmissionG = sampleTransmission(
            sampleNorm,
            v,
            position,
            roughnessValue,
            ior * (1.0 + uChromaticAberration * (0.35 + noise.r * 0.65)),
            uThickness + thicknessSmear * (0.25 + noise.r * 0.75),
            vec2(noise.g - 0.5, noise.b - 0.5)
          );
          vec4 transmissionB = sampleTransmission(
            sampleNorm,
            v,
            position,
            roughnessValue,
            ior * (1.0 + 2.0 * uChromaticAberration * (0.35 + noise.b * 0.65)),
            uThickness + thicknessSmear * (0.25 + noise.b * 0.75),
            vec2(noise.b - 0.5, noise.r - 0.5)
          );

          return vec3(
            transmissionR.r,
            transmissionG.g,
            transmissionB.b
          );
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `
        vec2 frostUv = fract(vCubeUv);
        vec2 mouseFrostData = texture2D(tMouseFrost, frostUv).rg;
        float mouseFrost = mouseFrostData.r;
        float mouseFrostRim = mouseFrostData.g;
        #include <clipping_planes_fragment>
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        roughnessFactor *= 1.0 - mouseFrost;

        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= texelRoughness.g;
        #endif
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #ifdef USE_NORMALMAP_OBJECTSPACE
          normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;

          #ifdef FLIP_SIDED
            normal = - normal;
          #endif

          #ifdef DOUBLE_SIDED
            normal = normal * faceDirection;
          #endif

          normal = normalize( normalMatrix * normal );
        #elif defined( USE_NORMALMAP_TANGENTSPACE )
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          mapN.xy *= 1.0 - mouseFrost;
          normal = normalize( tbn * mapN );
        #elif defined( USE_BUMPMAP )
          normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
        #endif
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `
        float triangleScale = 9.0 * min(1.0, uResolution.y / 1300.0);
        float trianglePattern = texture2D(tTriangles, fract(vCubeUv * triangleScale)).r;
        float fresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 worldView = normalize(cameraPosition - vWorldPositionCustom);
        vec3 transmitted = sampleChromaticTransmission(
          worldNormal,
          worldView,
          vWorldPositionCustom,
          roughnessFactor,
          mouseFrost
        );
        transmitted = pow(max(transmitted, vec3(0.0)), vec3(0.92));

        totalEmissiveRadiance += mouseFrostRim * uColorFrost * 0.65;
        totalEmissiveRadiance += trianglePattern * mouseFrostRim * uColorFrost * 3.2;
        totalEmissiveRadiance += vec3(trianglePattern * pow(mouseFrost, 2.0) * 0.2);

        vec3 outgoingLight = transmitted * 0.97
          + totalSpecular * 0.78
          + totalEmissiveRadiance
          + vec3(fresnel * 0.03);
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
    this.uniforms.uThickness.value = source.uniforms.uThickness.value;
    this.uniforms.uAttenuationDistance.value = source.uniforms.uAttenuationDistance.value;
    this.uniforms.uAttenuationColor.value.copy(source.uniforms.uAttenuationColor.value);
    return this;
  }
}
