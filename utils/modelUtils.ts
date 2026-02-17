import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime to use WASM
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

export interface ModelOutput {
    tongueX: number[];
    tongueY: number[];
    lips: number[];
    lipLen: number[];
    throat: number[];
    nasal: number[];
}

export const ModelUtils = {
    /**
     * Resamples the audio buffer to the target sample rate required by the model (usually 16000Hz or 22050Hz).
     */
    resampleBuffer: async (sourceBuffer: AudioBuffer, targetSampleRate: number = 16000): Promise<Float32Array> => {
        const offlineCtx = new OfflineAudioContext(1, (sourceBuffer.length * targetSampleRate) / sourceBuffer.sampleRate, targetSampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = sourceBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        const renderedBuffer = await offlineCtx.startRendering();
        return renderedBuffer.getChannelData(0);
    },

    /**
     * Loads an ONNX model file and runs inference on the audio data.
     * Assumes the model takes an input named 'input' (audio) and outputs 'output' (parameters).
     * 
     * NOTE: This mapping is generic. You may need to adjust the channel mapping
     * based on your specific WFL model's output shape.
     */
    runInference: async (modelBuffer: ArrayBuffer, audioData: Float32Array): Promise<ModelOutput | null> => {
        try {
            // 1. Create Session
            const session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'] });
            
            // 2. Prepare Input Tensor (Batch Size 1, TimeSteps, 1 Channel or just 1D array depending on model)
            // Common shape for audio models: [1, samples]
            const inputTensor = new ort.Tensor('float32', audioData, [1, audioData.length]);
            
            // 3. Run Inference
            // You might need to change 'input' to the specific input node name of your model
            const feeds: Record<string, ort.Tensor> = {};
            const inputNames = session.inputNames;
            feeds[inputNames[0]] = inputTensor;
            
            const results = await session.run(feeds);
            
            // 4. Parse Output
            const outputNames = session.outputNames;
            const outputTensor = results[outputNames[0]];
            const outputData = outputTensor.data as Float32Array; // Flattened data
            
            // Assuming output shape is [1, TimeSteps, 6] (6 parameters)
            // or [1, 6, TimeSteps]
            // We'll treat it as interleaved [p1, p2, p3, p4, p5, p6, p1, p2, ...] for this example
            // ADJUST THIS MAPPING BASED ON YOUR MODEL ARCHITECTURE
            
            const timeSteps = outputData.length / 6; 
            const result: ModelOutput = {
                tongueX: [], tongueY: [], lips: [], lipLen: [], throat: [], nasal: []
            };

            for(let t = 0; t < timeSteps; t++) {
                const offset = t * 6;
                // Clamp values to 0-1 range
                const clamp = (v: number) => Math.max(0, Math.min(1, v));
                
                result.tongueX.push(clamp(outputData[offset + 0]));
                result.tongueY.push(clamp(outputData[offset + 1]));
                result.lips.push(clamp(outputData[offset + 2]));
                result.lipLen.push(clamp(outputData[offset + 3]));
                result.throat.push(clamp(outputData[offset + 4]));
                result.nasal.push(clamp(outputData[offset + 5]));
            }

            return result;

        } catch (e) {
            console.error("ONNX Inference Failed:", e);
            throw e;
        }
    }
};