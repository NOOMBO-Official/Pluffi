const { removeBackground } = require('@imgly/background-removal-node');

async function run() {
  const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  try {
    const blobInput = new Blob([buf], { type: 'image/png' });
    const blobOutput = await removeBackground(blobInput);
    console.log("Blob input success");
  } catch (e) {
    console.error("Blob error:", e.message);
  }

  try {
    const uint8Input = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    const blobOutput = await removeBackground(uint8Input);
    console.log("Uint8Array input success");
  } catch (e) {
    console.error("Uint8Array error:", e.message);
  }
}
run();
