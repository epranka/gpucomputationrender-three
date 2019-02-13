import { Camera, DataTexture, Mesh, Scene, ShaderMaterial, WebGLRenderTarget, WebGLRenderer, Wrapping, TextureFilter, Texture, RenderTarget } from "three";
export declare class GPUComputationRendererVariable {
    name: string;
    initialValueTexture: Texture;
    renderTargets: WebGLRenderTarget[];
    dependencies: GPUComputationRendererVariable[];
    wrapS: Wrapping;
    wrapT: Wrapping;
    minFilter: TextureFilter;
    magFilter: TextureFilter;
    material: ShaderMaterial;
}
export declare class GPUComputationRenderer {
    scene: Scene;
    currentTextureIndex: number;
    variables: GPUComputationRendererVariable[];
    camera: Camera;
    sizeX: number;
    sizeY: number;
    renderer: WebGLRenderer;
    passThruShader: ShaderMaterial;
    mesh: Mesh;
    passThruUniforms: {
        texture: {
            value: any;
        };
    };
    constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer);
    private createShaderMaterial(computeFragmentShader, uniforms?);
    private addResolutionDefine(materialShader);
    private getPassThroughVertexShader();
    private getPassThroughFragmentShader();
    addVariable(variableName: string, computeFragmentShader: string, initialValueTexture: Texture): {
        name: string;
        initialValueTexture: Texture;
        material: ShaderMaterial;
        dependencies: any;
        renderTargets: any[];
        wrapS: any;
        wrapT: any;
        minFilter: TextureFilter;
        magFilter: TextureFilter;
    };
    setVariableDependencies(variable: GPUComputationRendererVariable, dependencies: GPUComputationRendererVariable[]): void;
    init(): string;
    createRenderTarget(sizeXTexture?: number, sizeYTexture?: number, wrapS?: Wrapping, wrapT?: Wrapping, minFilter?: TextureFilter, magFilter?: TextureFilter): WebGLRenderTarget;
    compute(): void;
    doRenderTarget(material: ShaderMaterial, output: RenderTarget): void;
    renderTexture(input: Texture, output: RenderTarget): void;
    getCurrentRenderTarget(variable: GPUComputationRendererVariable): WebGLRenderTarget;
    getAlternateRenderTarget(variable: GPUComputationRendererVariable): WebGLRenderTarget;
    createTexture(sizeXTexture?: number, sizeYTexture?: number): DataTexture;
}
