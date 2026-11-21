/* Lumina EAN decoder — local/offline, no external requests or dependencies.
 * Supports EAN-13, EAN-8 and UPC-A (reported as EAN-13 with leading zero).
 * Camera access is managed by script.js; this file only decodes video frames.
 */
(() => {
  'use strict';
  const L = [
    '0001101','0011001','0010011','0111101','0100011',
    '0110001','0101111','0111011','0110111','0001011'
  ];
  const G = [
    '0100111','0110011','0011011','0100001','0011101',
    '0111001','0000101','0010001','0001001','0010111'
  ];
  const R = [
    '1110010','1100110','1101100','1000010','1011100',
    '1001110','1010000','1000100','1001000','1110100'
  ];
  const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  let canvas = null, context = null;

  function checksumOk(code) {
    if (!/^\d+$/.test(code) || ![8,12,13].includes(code.length)) return false;
    let sum = 0;
    for (let i = 0; i < code.length - 1; i++) {
      const fromRight = code.length - 2 - i;
      sum += Number(code[i]) * (fromRight % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
  }

  function decodeModules(bits) {
    if (bits.length >= 95 && bits.slice(0,3) === '101' && bits.slice(45,50) === '01010' && bits.slice(92,95) === '101') {
      let left = '', right = '', parity = '';
      for (let i = 0; i < 6; i++) {
        const chunk = bits.slice(3 + i * 7, 10 + i * 7);
        let digit = L.indexOf(chunk), mode = 'L';
        if (digit < 0) { digit = G.indexOf(chunk); mode = 'G'; }
        if (digit < 0) return null;
        left += digit; parity += mode;
      }
      const first = PARITY.indexOf(parity);
      if (first < 0) return null;
      for (let i = 0; i < 6; i++) {
        const digit = R.indexOf(bits.slice(50 + i * 7, 57 + i * 7));
        if (digit < 0) return null;
        right += digit;
      }
      const code = String(first) + left + right;
      return checksumOk(code) ? code : null;
    }
    if (bits.length >= 67 && bits.slice(0,3) === '101' && bits.slice(31,36) === '01010' && bits.slice(64,67) === '101') {
      let left = '', right = '';
      for (let i = 0; i < 4; i++) {
        const digit = L.indexOf(bits.slice(3 + i * 7, 10 + i * 7));
        if (digit < 0) return null;
        left += digit;
      }
      for (let i = 0; i < 4; i++) {
        const digit = R.indexOf(bits.slice(36 + i * 7, 43 + i * 7));
        if (digit < 0) return null;
        right += digit;
      }
      const code = left + right;
      return checksumOk(code) ? code : null;
    }
    return null;
  }

  function decodeRow(data, width) {
    let min = 255, max = 0;
    for (let x = 0; x < width; x++) {
      const v = (data[x * 4] * 0.299 + data[x * 4 + 1] * 0.587 + data[x * 4 + 2] * 0.114);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min < 35) return null;
    const threshold = (min + max) / 2;
    const bits = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      const v = data[x * 4] * 0.299 + data[x * 4 + 1] * 0.587 + data[x * 4 + 2] * 0.114;
      bits[x] = v < threshold ? 1 : 0;
    }
    for (let start = 1; start < width - 100; start++) {
      if (!bits[start] || bits[start - 1]) continue;
      let x = start, run1 = 0, run2 = 0, run3 = 0;
      while (x < width && bits[x] === 1) { run1++; x++; }
      while (x < width && bits[x] === 0) { run2++; x++; }
      while (x < width && bits[x] === 1) { run3++; x++; }
      const module = (run1 + run2 + run3) / 3;
      if (module < 1.5 || Math.max(run1,run2,run3) / Math.max(1,Math.min(run1,run2,run3)) > 1.8) continue;
      for (const length of [95,67]) {
        if (start + module * length > width) continue;
        let sampled = '';
        for (let i = 0; i < length; i++) sampled += bits[Math.min(width - 1, Math.floor(start + (i + 0.5) * module))] ? '1' : '0';
        const result = decodeModules(sampled);
        if (result) return result;
      }
    }
    return null;
  }

  function decode(video) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    try {
      if (!canvas) { canvas = document.createElement('canvas'); context = canvas.getContext('2d', { willReadFrequently: true }); }
      const width = Math.min(1280, video.videoWidth);
      const scale = width / video.videoWidth;
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.width = width; canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const rows = [0.30,0.38,0.46,0.50,0.54,0.62,0.70];
      for (const fraction of rows) {
        const y = Math.min(height - 1, Math.round(height * fraction));
        const pixels = context.getImageData(0, y, width, 1).data;
        const code = decodeRow(pixels, width);
        if (code) return code;
      }
    } catch (error) {
      console.warn('Decodificador local EAN:', error);
    }
    return null;
  }

  window.LuminaEANDecoder = Object.freeze({ decode, checksumOk, version: '1.0.0' });
})();
