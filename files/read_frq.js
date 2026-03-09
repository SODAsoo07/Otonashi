const fs = require('fs');
const path = 'C:/Users/oyh57/Documents/GitHub/Otonashi/files/_a-a-i-a-u-a-e_wav.frq';
const buf = fs.readFileSync(path);

console.log('File Size:', buf.length);
console.log('Header Signature:', buf.toString('utf8', 0, 8)); // FREQ0003

const hopSize = buf.readInt32LE(8);
console.log('Samples Per Frame (Hop Size):', hopSize);

const avgAmp = buf.readDoubleLE(12);
console.log('Average Amplitude:', avgAmp);

// Let's just dump bytes 20 to 40 
console.log('Bytes 20-40 Hex:', buf.slice(20, 40).toString('hex'));

const numFrames = buf.readInt32LE(36);
console.log('Number of Frames from byte 36:', numFrames);

const headerSize = 40;
console.log('Header Dump Hex:', buf.slice(0, 40).toString('hex'));

if (numFrames > 0) {
    let frameSize = (buf.length - headerSize) / numFrames;
    console.log('Calculated bytes per frame:', frameSize);

    console.log('\n--- First 5 Frames ---');
    for (let i = 0; i < Math.min(5, numFrames); i++) {
        let offset = headerSize + i * frameSize;
        if (offset + 16 > buf.length) break;

        let f0 = buf.readDoubleLE(offset);
        let amp = buf.readDoubleLE(offset + 8);
        console.log(`Frame ${i}: F0=${f0.toFixed(2)}, Amp=${amp.toFixed(2)}`);
    }
}
