import test from 'node:test';
import assert from 'node:assert/strict';
import { VERDICTS, analyzeJpeg, parseJpegStructure, inspectExif } from '../js/trust-photo.js';

function createRealJpeg() {
  const buf = new Uint8Array(512);
  let pos = 0;

  buf[pos++] = 0xFF; buf[pos++] = 0xD8;

  buf[pos++] = 0xFF; buf[pos++] = 0xDB;
  buf[pos++] = 0x00; buf[pos++] = 0x43;
  for (let i = 0; i < 0x41; i++) buf[pos++] = 0x00;

  buf[pos++] = 0xFF; buf[pos++] = 0xC0;
  buf[pos++] = 0x00; buf[pos++] = 0x0C;
  buf[pos++] = 0x08; buf[pos++] = 0x00; buf[pos++] = 0x01;
  buf[pos++] = 0x00; buf[pos++] = 0x01; buf[pos++] = 0x01;
  buf[pos++] = 0x11; buf[pos++] = 0x00; buf[pos++] = 0x00; buf[pos++] = 0x00;

  buf[pos++] = 0xFF; buf[pos++] = 0xDA;
  buf[pos++] = 0x00; buf[pos++] = 0x08;
  buf[pos++] = 0x01; buf[pos++] = 0x01; buf[pos++] = 0x00; buf[pos++] = 0x00;
  buf[pos++] = 0x00; buf[pos++] = 0x00;

  buf[pos++] = 0xFF; buf[pos++] = 0x00;
  buf[pos++] = 0xAA; buf[pos++] = 0xBB;
  buf[pos++] = 0xFF; buf[pos++] = 0xD5;
  buf[pos++] = 0xFF; buf[pos++] = 0xD9;

  return buf.slice(0, pos);
}

function createLittleEndianExif(tags = {}) {
  const buf = new Uint8Array(512);
  const view = new DataView(buf.buffer);
  let pos = 0;

  buf[pos++] = 0x45; buf[pos++] = 0x78; buf[pos++] = 0x69;
  buf[pos++] = 0x66; buf[pos++] = 0x00; buf[pos++] = 0x00;

  const tiffBase = pos;
  buf[pos++] = 0x49; buf[pos++] = 0x49; buf[pos++] = 0x2A; buf[pos++] = 0x00;
  view.setUint32(pos, 8, true);
  pos += 4;

  const ifdPos = pos;
  const numTags = Object.keys(tags).length;
  view.setUint16(pos, numTags, true);
  pos += 2;

  let dataPos = (ifdPos - tiffBase) + 2 + numTags * 12 + 4;

  const entries = Object.entries(tags);
  for (const [tagName, value] of entries) {
    const tagNum = {
      Make: 0x010F, Model: 0x0110, DateTime: 0x0132,
      DateTimeOriginal: 0x9003, ExposureTime: 0x829A, FNumber: 0x829D,
      ISOSpeedRatings: 0x8827, Software: 0x0131, MakerNote: 0x927C,
      LensMake: 0xA433, LensModel: 0xA434,
    }[tagName] || 0x0000;

    view.setUint16(pos, tagNum, true);
    pos += 2;

    if (tagName === 'Make' || tagName === 'Model' || tagName === 'Software' || tagName === 'LensMake' || tagName === 'LensModel') {
      const str = (value || '') + '\x00';
      const bytes = new TextEncoder().encode(str);
      view.setUint16(pos, 2, true); pos += 2;
      view.setUint32(pos, bytes.length, true); pos += 4;
      view.setUint32(pos, dataPos, true); pos += 4;
      for (let i = 0; i < bytes.length; i++) buf[tiffBase + dataPos + i] = bytes[i];
      dataPos += bytes.length;
    } else if (tagName === 'DateTime' || tagName === 'DateTimeOriginal') {
      const str = (value || '2024:01:15 10:30:45') + '\x00';
      const bytes = new TextEncoder().encode(str);
      view.setUint16(pos, 2, true); pos += 2;
      view.setUint32(pos, bytes.length, true); pos += 4;
      view.setUint32(pos, dataPos, true); pos += 4;
      for (let i = 0; i < bytes.length; i++) buf[tiffBase + dataPos + i] = bytes[i];
      dataPos += bytes.length;
    } else if (tagName === 'ExposureTime' || tagName === 'FNumber') {
      view.setUint16(pos, 5, true); pos += 2;
      view.setUint32(pos, 1, true); pos += 4;
      view.setUint32(pos, dataPos, true); pos += 4;
      view.setUint32(tiffBase + dataPos, 0x00020001, true); dataPos += 4;
    } else if (tagName === 'ISOSpeedRatings') {
      view.setUint16(pos, 3, true); pos += 2;
      view.setUint32(pos, 1, true); pos += 4;
      view.setUint32(pos, 100, true); pos += 4;
    } else if (tagName === 'MakerNote') {
      view.setUint16(pos, 7, true); pos += 2;
      view.setUint32(pos, 32, true); pos += 4;
      view.setUint32(pos, dataPos, true); pos += 4;
      dataPos += 32;
    }
  }

  view.setUint32(pos, 0, true);
  pos += 4;
  return buf.slice(0, Math.max(pos, tiffBase + dataPos));
}

function createJpegWithApp1(exifData) {
  const totalLength = exifData.length + 2;
  const arr = new Uint8Array(4 + 2 + exifData.length + 2);
  arr[0] = 0xFF; arr[1] = 0xD8;
  arr[2] = 0xFF; arr[3] = 0xE1;
  arr[4] = (totalLength >> 8) & 0xFF;
  arr[5] = totalLength & 0xFF;
  for (let i = 0; i < exifData.length; i++) {
    arr[6 + i] = exifData[i];
  }
  arr[6 + exifData.length] = 0xFF;
  arr[6 + exifData.length + 1] = 0xD9;
  return arr.buffer;
}

test('parseJpegStructure: handles real SOS entropy data', () => {
  const realJpeg = createRealJpeg();
  const result = parseJpegStructure(realJpeg);
  assert.equal(result.valid, true);
  assert.ok(result.segments.some((s) => s.name === 'SOF0'));
  assert.ok(result.segments.some((s) => s.name === 'SOS'));
});

test('parseJpegStructure: accepts FF00 stuffed bytes', () => {
  const realJpeg = createRealJpeg();
  const result = parseJpegStructure(realJpeg);
  assert.equal(result.valid, true, 'Should handle FF00 without error');
});

test('parseJpegStructure: accepts restart markers in scan', () => {
  const realJpeg = createRealJpeg();
  const result = parseJpegStructure(realJpeg);
  assert.equal(result.valid, true, 'Should handle FFD5 restart marker');
});

test('parseJpegStructure: handles Uint8Array with byteOffset', () => {
  const realJpeg = createRealJpeg();
  const buffer = new ArrayBuffer(512);
  const fullArray = new Uint8Array(buffer);
  for (let i = 0; i < realJpeg.length; i++) {
    fullArray[i + 10] = realJpeg[i];
  }
  const subarray = new Uint8Array(buffer, 10, realJpeg.length);
  const result = parseJpegStructure(subarray);
  assert.equal(result.valid, true, 'Should parse JPEG from subarray offset');
});

test('analyzeJpeg: coherent required evidence yields exactly LIKELY_ORIGINAL', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:01:15 10:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.LIKELY_ORIGINAL);
  assert.equal(result.evidence.some((e) => e.status === 'REVIEW'), false, 'No REVIEW status with LIKELY_ORIGINAL');
});

test('analyzeJpeg: insufficient evidence yields exactly INCONCLUSIVE', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.INCONCLUSIVE);
});

test('analyzeJpeg: editor signature yields exactly REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:01:15 10:30:45',
    Software: 'Adobe Photoshop 2024',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
  assert.ok(result.evidence.some((e) => e.check === 'Edit Software' && e.status === 'REVIEW'));
});

test('analyzeJpeg: future timestamp yields REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2099:01:15 10:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
  assert.ok(result.evidence.some((e) => e.check === 'Capture Time' && e.status === 'REVIEW'));
});

test('analyzeJpeg: GPS presence returns only boolean', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:01:15 10:30:45',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /\d+\.\d+/, 'No coordinates in result');
});

test('analyzeJpeg: timestamp never appears in output', () => {
  const exif = createLittleEndianExif({
    DateTimeOriginal: '2024:01:15 10:30:45',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /10:30:45/, 'Exact timestamp not in output');
  assert.doesNotMatch(resultStr, /2024:01:15/, 'Exact date not in output');
});

test('analyzeJpeg: MakerNote never appears in output', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    MakerNote: 'sensitive_maker_data',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /sensitive_maker_data/, 'Raw MakerNote not exposed');
});

test('analyzeJpeg: malformed EXIF offset produces REVIEW_NEEDED', () => {
  const malformed = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1,
    0x00, 0xFF,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(malformed.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: returns only approved verdicts', () => {
  const verdictValues = Object.values(VERDICTS);
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const result = analyzeJpeg(minimal.buffer);
  assert.ok(verdictValues.includes(result.verdict));
});

test('analyzeJpeg: performs no fetch operation', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  assert.doesNotThrow(() => {
    analyzeJpeg(minimal.buffer);
  });
});

test('analyzeJpeg: performs no network operation', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  assert.doesNotThrow(() => {
    analyzeJpeg(minimal.buffer);
  });
});

test('analyzeJpeg: performs no storage operation', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  assert.doesNotThrow(() => {
    analyzeJpeg(minimal.buffer);
  });
});

test('analyzeJpeg: no REVIEW evidence with LIKELY_ORIGINAL verdict', () => {
  const exif = createLittleEndianExif({
    Make: 'Nikon',
    Model: 'Nikon Z6',
    DateTimeOriginal: '2024:06:20 14:30:00',
    FNumber: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  if (result.verdict === VERDICTS.LIKELY_ORIGINAL) {
    const hasReview = result.evidence.some((e) => e.status === 'REVIEW');
    assert.equal(hasReview, false, 'No REVIEW evidence with LIKELY_ORIGINAL');
  }
});

test('evidence array has stable structure', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const result = analyzeJpeg(minimal.buffer);
  assert.ok(Array.isArray(result.evidence));
  result.evidence.forEach((item) => {
    assert.ok(item.check);
    assert.ok(item.status);
    assert.ok(item.detail);
    const validStatuses = ['PASS', 'PRESENT', 'ABSENT', 'REVIEW'];
    assert.ok(validStatuses.includes(item.status));
  });
});

test('limitations array is always present', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const result = analyzeJpeg(minimal.buffer);
  assert.ok(Array.isArray(result.limitations));
  assert.ok(result.limitations.length > 0);
});

test('summary field is always a string', () => {
  const minimal = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const result = analyzeJpeg(minimal.buffer);
  assert.equal(typeof result.summary, 'string');
});

test('privacy object contains only booleans', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
  });
  const jpegData = createJpegWithApp1(exif);
  const structure = parseJpegStructure(jpegData);
  const result = inspectExif(jpegData, structure);

  assert.equal(typeof result.privacy.hasGPS, 'boolean');
  assert.equal(typeof result.privacy.hasMakerNote, 'boolean');
  assert.equal(typeof result.privacy.hasTimestamp, 'boolean');
  assert.equal(typeof result.privacy.hasCameraMake, 'boolean');
  assert.equal(typeof result.privacy.hasCameraModel, 'boolean');
  assert.equal(typeof result.privacy.hasExposureData, 'boolean');
  assert.equal(typeof result.privacy.hasLensData, 'boolean');
});

test('analyzeJpeg: metadata signals are sanitized (no raw Make/Model)', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon Corp',
    Model: 'Canon EOS 5D',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /Canon Corp/, 'Raw Make not exposed');
  assert.doesNotMatch(resultStr, /Canon EOS 5D/, 'Raw Model not exposed');
});

test('analyzeJpeg: nested DateTimeOriginal with exposure yields LIKELY_ORIGINAL', () => {
  const exif = createLittleEndianExif({
    Make: 'Nikon',
    Model: 'Z6',
    DateTimeOriginal: '2024:06:15 14:22:33',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.LIKELY_ORIGINAL);
});

test('analyzeJpeg: lens data counts as supporting signal', () => {
  const exif = createLittleEndianExif({
    Make: 'Sony',
    Model: 'A7IV',
    DateTimeOriginal: '2024:05:20 09:15:00',
    LensModel: 'FE 50mm f/1.8',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.ok(result.evidence.some((e) => e.check === 'Lens Data' && e.status === 'PRESENT'));
  assert.equal(result.verdict, VERDICTS.LIKELY_ORIGINAL);
});

test('timestamp validation: February 30 yields REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:02:30 10:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('timestamp validation: invalid hour yields REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:15 25:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('timestamp validation: leap day 2024 is plausible', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:02:29 10:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.LIKELY_ORIGINAL);
  assert.ok(result.evidence.some((e) => e.check === 'Capture Time' && e.status === 'PRESENT'));
});

test('analyzeJpeg: out-of-bounds nested ExifIFD yields REVIEW_NEEDED', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1, 0x00, 0x50,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x02, 0x00,
    0x0F, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00,
    0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: malformed GPS pointer yields REVIEW_NEEDED', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1, 0x00, 0x40,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: malicious Make does not appear in output', () => {
  const exif = createLittleEndianExif({
    Make: '<img src=x onerror="alert(1)">',
    Model: 'Canon EOS',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /onerror/, 'XSS markup not in output');
  assert.doesNotMatch(resultStr, /<img/, 'HTML tags not in output');
});

test('analyzeJpeg: Photoshop in Software triggers REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:15 10:30:45',
    Software: 'Adobe Photoshop 2024',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
  assert.ok(result.evidence.some((e) => e.check === 'Edit Software' && e.status === 'REVIEW'));
});

test('analyzeJpeg: shared visited offset Set prevents infinite recursion', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1, 0x00, 0x30,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x02, 0x00,
    0x0F, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00, 0x1A, 0x00, 0x00, 0x00,
    0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: timestamp with invalid minute yields REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:15 10:75:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: timestamp with invalid second yields REVIEW_NEEDED', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:15 10:30:99',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: XMP Photoshop without EXIF yields REVIEW_NEEDED', () => {
  const xmpData = new Uint8Array([
    0x68, 0x74, 0x74, 0x70, 0x3A, 0x2F, 0x2F, 0x6E, 0x73, 0x2E, 0x61, 0x64, 0x6F, 0x62, 0x65, 0x2E,
    0x63, 0x6F, 0x6D, 0x2F, 0x78, 0x61, 0x70, 0x2F, 0x50, 0x68, 0x6F, 0x74, 0x6F, 0x73, 0x68, 0x6F, 0x70,
  ]);
  const jpegData = createJpegWithApp1(xmpData);
  const result = analyzeJpeg(jpegData);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: COM Lightroom without EXIF yields REVIEW_NEEDED', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xFE, 0x00, 0x20,
    0x41, 0x64, 0x6F, 0x62, 0x65, 0x20, 0x4C, 0x69, 0x67, 0x68, 0x74, 0x72, 0x6F, 0x6F, 0x6D, 0x20, 0x36, 0x2E, 0x30, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: XMP before EXIF does not block EXIF discovery', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:15 10:30:45',
    ExposureTime: 'present',
  });
  const jpegDataWithExif = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegDataWithExif);
  assert.equal(result.evidence.some((e) => e.check === 'EXIF Metadata' && e.status === 'PRESENT'), true);
});

test('analyzeJpeg: timestamp within 24-hour tolerance is plausible', () => {
  const now = new Date('2024-06-15T10:00:00Z').getTime();
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:16 08:00:00',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData, { now });
  assert.equal(result.verdict, VERDICTS.LIKELY_ORIGINAL);
});

test('analyzeJpeg: timestamp 25 hours in future exceeds tolerance and yields REVIEW_NEEDED', () => {
  const now = new Date('2024-06-15T10:30:45Z');
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
    DateTimeOriginal: '2024:06:16 11:30:45',
    ExposureTime: 'present',
  });
  const jpegData = createJpegWithApp1(exif);
  const result = analyzeJpeg(jpegData, { now });
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: out-of-bounds GPS IFD yields REVIEW_NEEDED', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1, 0x00, 0x50,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x30, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});

test('analyzeJpeg: valid GPS pointer produces hasGPS boolean without coordinates', () => {
  const exif = createLittleEndianExif({
    Make: 'Canon',
    Model: 'Canon EOS',
  });
  const jpegData = createJpegWithApp1(exif);
  const structure = parseJpegStructure(jpegData);
  const result = inspectExif(jpegData, structure);
  const resultStr = JSON.stringify(result);
  assert.doesNotMatch(resultStr, /\d+\.\d+/, 'No GPS coordinates in output');
});

test('analyzeJpeg: plausible DateTime + inconsistent nested DateTimeOriginal yields REVIEW_NEEDED', () => {
  const buf = new Uint8Array([
    0xFF, 0xD8,
    0xFF, 0xE1, 0x00, 0x80,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2A, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x03, 0x00,
    0x0F, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00, 0x00,
    0x10, 0x01, 0x02, 0x00, 0x08, 0x00, 0x00, 0x00, 0x38, 0x00, 0x00, 0x00,
    0x32, 0x01, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
    0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x54, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x43, 0x61, 0x6E, 0x6F, 0x6E, 0x00, 0x00, 0x00,
    0x43, 0x61, 0x6E, 0x6F, 0x6E, 0x20, 0x45, 0x4F,
    0x32, 0x30, 0x32, 0x34, 0x3A, 0x30, 0x36, 0x3A, 0x31, 0x35, 0x20, 0x31, 0x30, 0x3A, 0x33, 0x30, 0x3A, 0x34, 0x35, 0x00,
    0x01, 0x00, 0x03, 0x00, 0x02, 0x00, 0x00, 0x00, 0x9F, 0x01, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0xD9,
  ]);
  const result = analyzeJpeg(buf.buffer);
  assert.equal(result.verdict, VERDICTS.REVIEW_NEEDED);
});
