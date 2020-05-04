/**
 * @author yomboprime https://github.com/yomboprime
 *
 * GPUComputationRenderer, based on SimulationRenderer by zz85
 *
 * The GPUComputationRenderer uses the concept of variables. These variables are RGBA float textures that hold 4 floats
 * for each compute element (texel)
 *
 * Each variable has a fragment shader that defines the computation made to obtain the variable in question.
 * You can use as many variables you need, and make dependencies so you can use textures of other variables in the shader
 * (the sampler uniforms are added automatically) Most of the variables will need themselves as dependency.
 *
 * The renderer has actually two render targets per variable, to make ping-pong. Textures from the current frame are used
 * as inputs to render the textures of the next frame.
 *
 * The render targets of the variables can be used as input textures for your visualization shaders.
 *
 * Variable names should be valid identifiers and should not collide with THREE GLSL used identifiers.
 * a common approach could be to use 'texture' prefixing the variable name; i.e texturePosition, textureVelocity...
 *
 * The size of the computation (sizeX * sizeY) is defined as 'resolution' automatically in the shader. For example:
 * #DEFINE resolution vec2( 1024.0, 1024.0 )
 *
 * -------------
 *
 * Basic use:
 *
 * // Initialization...
 *
 * // Create computation renderer
 * var gpuCompute = new GPUComputationRenderer( 1024, 1024, renderer );
 *
 * // Create initial state float textures
 * var pos0 = gpuCompute.createTexture();
 * var vel0 = gpuCompute.createTexture();
 * // and fill in here the texture data...
 *
 * // Add texture variables
 * var velVar = gpuCompute.addVariable( "textureVelocity", fragmentShaderVel, pos0 );
 * var posVar = gpuCompute.addVariable( "texturePosition", fragmentShaderPos, vel0 );
 *
 * // Add variable dependencies
 * gpuCompute.setVariableDependencies( velVar, [ velVar, posVar ] );
 * gpuCompute.setVariableDependencies( posVar, [ velVar, posVar ] );
 *
 * // Add custom uniforms
 * velVar.material.uniforms.time = { value: 0.0 };
 *
 * // Check for completeness
 * var error = gpuCompute.init();
 * if ( error !== null ) {
 *		console.error( error );
 * }
 *
 *
 * // In each frame...
 *
 * // Compute!
 * gpuCompute.compute();
 *
 * // Update texture uniforms in your visualization materials with the gpu renderer output
 * myMaterial.uniforms.myTexture.value = gpuCompute.getCurrentRenderTarget( posVar ).texture;
 *
 * // Do your rendering
 * renderer.render( myScene, myCamera );
 *
 * -------------
 *
 * Also, you can use utility functions to create ShaderMaterial and perform computations (rendering between textures)
 * Note that the shaders can have multiple input textures.
 *
 * var myFilter1 = gpuCompute.createShaderMaterial( myFilterFragmentShader1, { theTexture: { value: null } } );
 * var myFilter2 = gpuCompute.createShaderMaterial( myFilterFragmentShader2, { theTexture: { value: null } } );
 *
 * var inputTexture = gpuCompute.createTexture();
 *
 * // Fill in here inputTexture...
 *
 * myFilter1.uniforms.theTexture.value = inputTexture;
 *
 * var myRenderTarget = gpuCompute.createRenderTarget();
 * myFilter2.uniforms.theTexture.value = myRenderTarget.texture;
 *
 * var outputRenderTarget = gpuCompute.createRenderTarget();
 *
 * // Now use the output texture where you want:
 * myMaterial.uniforms.map.value = outputRenderTarget.texture;
 *
 * // And compute each frame, before rendering to screen:
 * gpuCompute.doRenderTarget( myFilter1, myRenderTarget );
 * gpuCompute.doRenderTarget( myFilter2, outputRenderTarget );
 *
 *
 *
 * @param {int} sizeX Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {int} sizeY Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {WebGLRenderer} renderer The renderer
 */

import {
    Camera,
    ClampToEdgeWrapping,
    DataTexture,
    FloatType,
    HalfFloatType,
    Mesh,
    NearestFilter,
    PlaneBufferGeometry,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    WebGLRenderTarget,
    WebGLRenderer,
    Wrapping,
    TextureFilter,
    Texture,
    RenderTarget
} from "three";

export class GPUComputationRendererVariable {
    public name: string;
    public initialValueTexture: Texture;
    public renderTargets: WebGLRenderTarget[] = [];
    public dependencies: GPUComputationRendererVariable[] = [];
    public wrapS: Wrapping;
    public wrapT: Wrapping;
    public minFilter: TextureFilter;
    public magFilter: TextureFilter;
    public material: ShaderMaterial;
}

export class GPUComputationRenderer {
    public scene: Scene;
    public currentTextureIndex: number;
    public variables: GPUComputationRendererVariable[];
    public camera: Camera;
    public sizeX: number;
    public sizeY: number;
    public renderer: WebGLRenderer;
    public passThruShader: ShaderMaterial;
    public mesh: Mesh;
    public passThruUniforms: { texture: { value: any } };
    constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.renderer = renderer;
        this.variables = [];
        this.currentTextureIndex = 0;
        this.scene = new Scene();
        this.camera = new Camera();
        this.camera.position.z = 1;
        this.passThruUniforms = {
            texture: { value: null }
        };

        this.passThruShader = this.createShaderMaterial(
            this.getPassThroughFragmentShader(),
            this.passThruUniforms
        );

        this.mesh = new Mesh(
            new PlaneBufferGeometry(2, 2),
            this.passThruShader
        );
        this.scene.add(this.mesh);
    }

    private createShaderMaterial(
        computeFragmentShader: string,
        uniforms: any = {}
    ) {
        let material = new ShaderMaterial({
            uniforms,
            vertexShader: this.getPassThroughVertexShader(),
            fragmentShader: computeFragmentShader
        });

        this.addResolutionDefine(material);

        return material;
    }

    private addResolutionDefine(materialShader: ShaderMaterial) {
        materialShader.defines.resolution =
            "vec2( " +
            this.sizeX.toFixed(1) +
            ", " +
            this.sizeY.toFixed(1) +
            " )";
    }

    private getPassThroughVertexShader() {
        return `void main(){
					gl_Position = vec4( position, 1.0 );
				}`;
    }

    private getPassThroughFragmentShader() {
        return `uniform sampler2D texture;
				void main() {
					vec2 uv = gl_FragCoord.xy / resolution.xy;
					gl_FragColor = texture2D( texture, uv );
				}`;
    }

    public addVariable(
        variableName: string,
        computeFragmentShader: string,
        initialValueTexture: Texture
    ) {
        let material = this.createShaderMaterial(computeFragmentShader);

        let variable = {
            name: variableName,
            initialValueTexture,
            material,
            dependencies: null,
            renderTargets: [],
            wrapS: null,
            wrapT: null,
            minFilter: NearestFilter,
            magFilter: NearestFilter
        };

        this.variables.push(variable);

        return variable;
    }

    public setVariableDependencies(
        variable: GPUComputationRendererVariable,
        dependencies: GPUComputationRendererVariable[]
    ) {
        variable.dependencies = dependencies;
    }

    public init() {
        if (!this.renderer.extensions.get("OES_texture_float")) {
            return "No OES_texture_float support for float textures.";
        }

        if (this.renderer.capabilities.maxVertexTextures === 0) {
            return "No support for vertex shader textures.";
        }

        for (let i = 0; i < this.variables.length; i++) {
            let variable = this.variables[i];

            // Creates rendertargets and initialize them with input texture
            variable.renderTargets[0] = this.createRenderTarget(
                this.sizeX,
                this.sizeY,
                variable.wrapS,
                variable.wrapT,
                variable.minFilter,
                variable.magFilter
            );
            variable.renderTargets[1] = this.createRenderTarget(
                this.sizeX,
                this.sizeY,
                variable.wrapS,
                variable.wrapT,
                variable.minFilter,
                variable.magFilter
            );
            this.renderTexture(
                variable.initialValueTexture,
                variable.renderTargets[0]
            );
            this.renderTexture(
                variable.initialValueTexture,
                variable.renderTargets[1]
            );

            // Adds dependencies uniforms to the ShaderMaterial
            let material = variable.material;
            let uniforms = material.uniforms;
            if (variable.dependencies !== null) {
                for (let d = 0; d < variable.dependencies.length; d++) {
                    let depVar = variable.dependencies[d];

                    if (depVar.name !== variable.name) {
                        // Checks if variable exists
                        let found = false;
                        for (let j = 0; j < this.variables.length; j++) {
                            if (depVar.name === this.variables[j].name) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            return (
                                "Variable dependency not found. Variable=" +
                                variable.name +
                                ", dependency=" +
                                depVar.name
                            );
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

    public createRenderTarget(
        sizeXTexture: number = this.sizeX,
        sizeYTexture: number = this.sizeY,
        wrapS: Wrapping = ClampToEdgeWrapping,
        wrapT: Wrapping = ClampToEdgeWrapping,
        minFilter: TextureFilter = NearestFilter,
        magFilter: TextureFilter = NearestFilter
    ) {
        let renderTarget = new WebGLRenderTarget(sizeXTexture, sizeYTexture, {
            wrapS,
            wrapT,
            minFilter,
            magFilter,
            format: RGBAFormat,
            type: /(iPad|iPhone|iPod)/g.test(window.navigator.userAgent)
                ? HalfFloatType
                : FloatType,
            stencilBuffer: false
        });

        return renderTarget;
    }

    public compute() {
        let currentTextureIndex = this.currentTextureIndex;
        let nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

        for (let i = 0, il = this.variables.length; i < il; i++) {
            let variable = this.variables[i];

            // Sets texture dependencies uniforms
            if (variable.dependencies !== null) {
                let uniforms = variable.material.uniforms;
                for (
                    let d = 0, dl = variable.dependencies.length;
                    d < dl;
                    d++
                ) {
                    let depVar = variable.dependencies[d];

                    uniforms[depVar.name].value =
                        depVar.renderTargets[currentTextureIndex].texture;
                }
            }

            // Performs the computation for this variable
            this.doRenderTarget(
                variable.material,
                variable.renderTargets[nextTextureIndex]
            );
        }

        this.currentTextureIndex = nextTextureIndex;
    }

    public doRenderTarget(material: ShaderMaterial, output: RenderTarget) {
        this.mesh.material = material;
		this.renderer.setRenderTarget(output);
        this.renderer.render(this.scene, this.camera);
        this.mesh.material = this.passThruShader;
    }

    public renderTexture(input: Texture, output: RenderTarget) {
        // Takes a texture, and render out in rendertarget
        // input = Texture
        // output = RenderTarget

        this.passThruUniforms.texture.value = input;

        this.doRenderTarget(this.passThruShader, output);

        this.passThruUniforms.texture.value = null;
    }

    public getCurrentRenderTarget(variable: GPUComputationRendererVariable) {
        return variable.renderTargets[this.currentTextureIndex];
    }

    public getAlternateRenderTarget(variable: GPUComputationRendererVariable) {
        return variable.renderTargets[this.currentTextureIndex === 0 ? 1 : 0];
    }

    public createTexture(
        sizeXTexture: number = this.sizeX,
        sizeYTexture: number = this.sizeY
    ): DataTexture {
        let a = new Float32Array(sizeXTexture * sizeYTexture * 4);
        let texture = new DataTexture(
            a,
            this.sizeX,
            this.sizeY,
            RGBAFormat,
            FloatType
        );
        texture.needsUpdate = true;
        return texture;
    }
}
