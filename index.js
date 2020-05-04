"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const three_1 = require("three");
class GPUComputationRendererVariable {
    constructor() {
        this.renderTargets = [];
        this.dependencies = [];
    }
}
exports.GPUComputationRendererVariable = GPUComputationRendererVariable;
class GPUComputationRenderer {
    constructor(sizeX, sizeY, renderer) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.renderer = renderer;
        this.variables = [];
        this.currentTextureIndex = 0;
        this.scene = new three_1.Scene();
        this.camera = new three_1.Camera();
        this.camera.position.z = 1;
        this.passThruUniforms = {
            texture: { value: null }
        };
        this.passThruShader = this.createShaderMaterial(this.getPassThroughFragmentShader(), this.passThruUniforms);
        this.mesh = new three_1.Mesh(new three_1.PlaneBufferGeometry(2, 2), this.passThruShader);
        this.scene.add(this.mesh);
    }
    createShaderMaterial(computeFragmentShader, uniforms = {}) {
        let material = new three_1.ShaderMaterial({
            uniforms,
            vertexShader: this.getPassThroughVertexShader(),
            fragmentShader: computeFragmentShader
        });
        this.addResolutionDefine(material);
        return material;
    }
    addResolutionDefine(materialShader) {
        materialShader.defines.resolution =
            "vec2( " +
                this.sizeX.toFixed(1) +
                ", " +
                this.sizeY.toFixed(1) +
                " )";
    }
    getPassThroughVertexShader() {
        return `void main(){
					gl_Position = vec4( position, 1.0 );
				}`;
    }
    getPassThroughFragmentShader() {
        return `uniform sampler2D texture;
				void main() {
					vec2 uv = gl_FragCoord.xy / resolution.xy;
					gl_FragColor = texture2D( texture, uv );
				}`;
    }
    addVariable(variableName, computeFragmentShader, initialValueTexture) {
        let material = this.createShaderMaterial(computeFragmentShader);
        let variable = {
            name: variableName,
            initialValueTexture,
            material,
            dependencies: null,
            renderTargets: [],
            wrapS: null,
            wrapT: null,
            minFilter: three_1.NearestFilter,
            magFilter: three_1.NearestFilter
        };
        this.variables.push(variable);
        return variable;
    }
    setVariableDependencies(variable, dependencies) {
        variable.dependencies = dependencies;
    }
    init() {
        if (!this.renderer.extensions.get("OES_texture_float")) {
            return "No OES_texture_float support for float textures.";
        }
        if (this.renderer.capabilities.maxVertexTextures === 0) {
            return "No support for vertex shader textures.";
        }
        for (let i = 0; i < this.variables.length; i++) {
            let variable = this.variables[i];
            variable.renderTargets[0] = this.createRenderTarget(this.sizeX, this.sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter);
            variable.renderTargets[1] = this.createRenderTarget(this.sizeX, this.sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter);
            this.renderTexture(variable.initialValueTexture, variable.renderTargets[0]);
            this.renderTexture(variable.initialValueTexture, variable.renderTargets[1]);
            let material = variable.material;
            let uniforms = material.uniforms;
            if (variable.dependencies !== null) {
                for (let d = 0; d < variable.dependencies.length; d++) {
                    let depVar = variable.dependencies[d];
                    if (depVar.name !== variable.name) {
                        let found = false;
                        for (let j = 0; j < this.variables.length; j++) {
                            if (depVar.name === this.variables[j].name) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            return ("Variable dependency not found. Variable=" +
                                variable.name +
                                ", dependency=" +
                                depVar.name);
                        }
                    }
                    uniforms[depVar.name] = { value: null };
                    material.fragmentShader =
                        "\nuniform sampler2D " +
                            depVar.name +
                            ";\n" +
                            material.fragmentShader;
                }
            }
        }
        this.currentTextureIndex = 0;
        return null;
    }
    createRenderTarget(sizeXTexture = this.sizeX, sizeYTexture = this.sizeY, wrapS = three_1.ClampToEdgeWrapping, wrapT = three_1.ClampToEdgeWrapping, minFilter = three_1.NearestFilter, magFilter = three_1.NearestFilter) {
        let renderTarget = new three_1.WebGLRenderTarget(sizeXTexture, sizeYTexture, {
            wrapS,
            wrapT,
            minFilter,
            magFilter,
            format: three_1.RGBAFormat,
            type: /(iPad|iPhone|iPod)/g.test(window.navigator.userAgent)
                ? three_1.HalfFloatType
                : three_1.FloatType,
            stencilBuffer: false
        });
        return renderTarget;
    }
    compute() {
        let currentTextureIndex = this.currentTextureIndex;
        let nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;
        for (let i = 0, il = this.variables.length; i < il; i++) {
            let variable = this.variables[i];
            if (variable.dependencies !== null) {
                let uniforms = variable.material.uniforms;
                for (let d = 0, dl = variable.dependencies.length; d < dl; d++) {
                    let depVar = variable.dependencies[d];
                    uniforms[depVar.name].value =
                        depVar.renderTargets[currentTextureIndex].texture;
                }
            }
            this.doRenderTarget(variable.material, variable.renderTargets[nextTextureIndex]);
        }
        this.currentTextureIndex = nextTextureIndex;
    }
    doRenderTarget(material, output) {
        this.mesh.material = material;
        this.renderer.setRenderTarget(output);
        this.renderer.render(this.scene, this.camera);
        this.mesh.material = this.passThruShader;
    }
    renderTexture(input, output) {
        this.passThruUniforms.texture.value = input;
        this.doRenderTarget(this.passThruShader, output);
        this.passThruUniforms.texture.value = null;
    }
    getCurrentRenderTarget(variable) {
        return variable.renderTargets[this.currentTextureIndex];
    }
    getAlternateRenderTarget(variable) {
        return variable.renderTargets[this.currentTextureIndex === 0 ? 1 : 0];
    }
    createTexture(sizeXTexture = this.sizeX, sizeYTexture = this.sizeY) {
        let a = new Float32Array(sizeXTexture * sizeYTexture * 4);
        let texture = new three_1.DataTexture(a, this.sizeX, this.sizeY, three_1.RGBAFormat, three_1.FloatType);
        texture.needsUpdate = true;
        return texture;
    }
}
exports.GPUComputationRenderer = GPUComputationRenderer;
