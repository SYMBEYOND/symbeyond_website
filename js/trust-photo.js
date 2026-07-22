const VERDICTS = {
  METADATA_CONSISTENT: 'CAMERA METADATA CONSISTENT',
  INCONCLUSIVE: 'INCONCLUSIVE',
  REVIEW_NEEDED: 'REVIEW NEEDED',
};

const PROVENANCE = {
  NOT_VERIFIED: 'NOT VERIFIED',
};

function createByteView(input) {
  if (input instanceof DataView) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new DataView(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof Uint8Array) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new Error('Invalid input: must be ArrayBuffer or ArrayBuffer view');
}

function getViewLength(input) {
  if (input instanceof DataView) {
    return input.byteLength;
  }
  if (input instanceof ArrayBuffer) {
    return input.byteLength;
  }
  if (ArrayBuffer.isView(input) || input instanceof Uint8Array) {
    return input.byteLength;
  }
  throw new Error('Invalid input type');
}

function parseJpegStructure(input) {
  if (!input) {
    return { valid: false, error: 'No input', segments: [] };
  }

  let view;
  let length;

  try {
    view = createByteView(input);
    length = getViewLength(input);
  } catch (e) {
    return { valid: false, error: e.message, segments: [] };
  }

  if (length < 4) {
    return { valid: false, error: 'File too small', segments: [] };
  }

  const segments = [];
  let pos = 0;

  if (view.getUint8(pos) !== 0xFF || view.getUint8(pos + 1) !== 0xD8) {
    return { valid: false, error: 'Missing JPEG SOI (FFD8)', segments: [] };
  }
  segments.push({ marker: 0xFFD8, name: 'SOI', offset: 0, length: 2 });
  pos = 2;

  let foundEOI = false;
  let inScan = false;

  while (pos < length - 1 && !foundEOI) {
    if (inScan) {
      while (pos < length) {
        if (view.getUint8(pos) === 0xFF) {
          if (pos + 1 >= length) {
            return { valid: false, error: 'Truncated marker in scan data', segments };
          }
          const nextByte = view.getUint8(pos + 1);

          if (nextByte === 0x00) {
            pos += 2;
            continue;
          }
          if (nextByte >= 0xD0 && nextByte <= 0xD7) {
            pos += 2;
            continue;
          }
          if (nextByte === 0xFF) {
            pos += 1;
            continue;
          }
          inScan = false;
          break;
        }
        pos++;
      }
      if (!inScan) continue;
    }

    if (pos >= length - 1) break;

    const b0 = view.getUint8(pos);
    const b1 = view.getUint8(pos + 1);

    if (b0 !== 0xFF) {
      return { valid: false, error: `Invalid marker at ${pos}`, segments };
    }

    const marker = (b0 << 8) | b1;
    pos += 2;

    if (marker === 0xFFD9) {
      segments.push({ marker, name: 'EOI', offset: pos - 2, length: 2 });
      foundEOI = true;
      break;
    }

    if (marker === 0xFF00 || (marker >= 0xFFD0 && marker <= 0xFFD7)) {
      continue;
    }

    if (pos + 2 > length) {
      return { valid: false, error: 'Truncated segment length', segments };
    }

    const segmentLength = view.getUint16(pos, false);
    if (segmentLength < 2) {
      return { valid: false, error: `Invalid segment length ${segmentLength}`, segments };
    }

    const segmentEnd = pos + segmentLength;
    if (segmentEnd > length) {
      return { valid: false, error: `Segment overrun at ${pos}`, segments };
    }

    const name = {
      0xFFE1: 'APP1',
      0xFFE0: 'APP0',
      0xFFDB: 'DQT',
      0xFFC0: 'SOF0',
      0xFFC2: 'SOF2',
      0xFFC4: 'DHT',
      0xFFDD: 'DRI',
      0xFFDA: 'SOS',
      0xFFFE: 'COM',
    }[marker] || 'UNKNOWN';

    segments.push({
      marker,
      name,
      offset: pos - 2,
      length: segmentLength + 2,
      dataOffset: pos + 2,
      dataLength: segmentLength - 2,
    });

    if (marker === 0xFFDA) {
      inScan = true;
    }

    pos = segmentEnd;
  }

  return {
    valid: foundEOI,
    error: foundEOI ? null : 'Missing EOI marker',
    segments,
  };
}

function inspectExif(input, jpegStructure, options = {}) {
  const result = {
    present: false,
    error: null,
    metadata: {},
    timestampStatus: 'absent',
    editorSignatureDetected: false,
    privacy: {
      hasGPS: false,
      hasMakerNote: false,
      hasTimestamp: false,
      hasCameraMake: false,
      hasCameraModel: false,
      hasExposureData: false,
      hasLensData: false,
    },
  };

  if (!jpegStructure.valid) {
    result.error = jpegStructure.error;
    return result;
  }

  let view;
  let length;

  try {
    view = createByteView(input);
    length = getViewLength(input);
  } catch (e) {
    result.error = e.message;
    return result;
  }

  const app1Segments = jpegStructure.segments.filter((s) => s.marker === 0xFFE1);

  let xmpSig = detectXmpEditorSignature(app1Segments, view, length);
  if (xmpSig) {
    result.editorSignatureDetected = true;
  }

  const comSegments = jpegStructure.segments.filter((s) => s.marker === 0xFFFE);
  let comSig = detectComEditorSignature(comSegments, view, length);
  if (comSig) {
    result.editorSignatureDetected = true;
  }

  if (app1Segments.length === 0) {
    return result;
  }

  let app1Segment = null;
  for (const seg of app1Segments) {
    if (seg.dataOffset + 6 <= length &&
        view.getUint8(seg.dataOffset) === 0x45 &&
        view.getUint8(seg.dataOffset + 1) === 0x78 &&
        view.getUint8(seg.dataOffset + 2) === 0x69 &&
        view.getUint8(seg.dataOffset + 3) === 0x66 &&
        view.getUint8(seg.dataOffset + 4) === 0x00 &&
        view.getUint8(seg.dataOffset + 5) === 0x00) {
      app1Segment = seg;
      break;
    }
  }

  if (!app1Segment) {
    return result;
  }

  if (app1Segment.dataOffset + app1Segment.dataLength > length) {
    result.error = 'Truncated APP1';
    return result;
  }

  const exifDataStart = app1Segment.dataOffset;
  const exifDataEnd = app1Segment.dataOffset + app1Segment.dataLength;

  const tiffStart = exifDataStart + 6;
  if (tiffStart + 8 > exifDataEnd) {
    result.error = 'Truncated TIFF header';
    return result;
  }

  let littleEndian = true;
  const byteOrder = view.getUint16(tiffStart, false);
  if (byteOrder === 0x4949) {
    littleEndian = true;
  } else if (byteOrder === 0x4D4D) {
    littleEndian = false;
  } else {
    result.error = 'Invalid TIFF byte order';
    return result;
  }

  const magic = view.getUint16(tiffStart + 2, littleEndian);
  if (magic !== 0x002A) {
    result.error = 'Invalid TIFF magic';
    return result;
  }

  result.present = true;

  let ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const visitedOffsets = new Set();
  const ifdData = readIFD(view, tiffStart, exifDataStart, exifDataEnd, ifdOffset, littleEndian, options, visitedOffsets);

  if (ifdData.error) {
    result.error = ifdData.error;
    return result;
  }

  result.metadata = ifdData.tags;
  result.timestampStatus = ifdData.timestampStatus || 'absent';

  if (ifdData.tags.hasCameraMake) {
    result.privacy.hasCameraMake = true;
  }
  if (ifdData.tags.hasCameraModel) {
    result.privacy.hasCameraModel = true;
  }
  if (ifdData.tags.hasTimestamp) {
    result.privacy.hasTimestamp = true;
  }
  if (ifdData.tags.hasMakerNote) {
    result.privacy.hasMakerNote = true;
  }
  if (ifdData.tags.hasExposureData) {
    result.privacy.hasExposureData = true;
  }
  if (ifdData.tags.hasLensData) {
    result.privacy.hasLensData = true;
  }
  if (ifdData.tags.hasGPS) {
    result.privacy.hasGPS = true;
  }

  return result;
}

function readIFD(view, tiffStart, exifDataStart, exifDataEnd, ifdOffset, littleEndian, options = {}, visitedOffsets = new Set()) {
  const tags = {};
  let timestampStatus = 'absent';
  const depth = options.depth || 0;
  const maxDepth = 3;

  if (depth > maxDepth) {
    return { tags, timestampStatus, error: 'Max IFD depth exceeded' };
  }

  const ifdPos = tiffStart + ifdOffset;
  if (ifdPos < exifDataStart || ifdPos + 2 > exifDataEnd) {
    return { tags, timestampStatus, error: 'IFD offset out of bounds' };
  }

  const key = `${ifdPos}`;
  if (visitedOffsets.has(key)) {
    return { tags, timestampStatus, error: 'Circular IFD reference' };
  }
  visitedOffsets.add(key);

  try {
    const numEntries = view.getUint16(ifdPos, littleEndian);
    if (numEntries > 500) {
      return { tags, timestampStatus, error: 'Unreasonable IFD entry count' };
    }

    let pos = ifdPos + 2;

    for (let i = 0; i < numEntries; i++) {
      if (pos + 12 > exifDataEnd) {
        return { tags, timestampStatus, error: 'IFD entry overrun' };
      }

      const tag = view.getUint16(pos, littleEndian);
      const type = view.getUint16(pos + 2, littleEndian);
      const count = view.getUint32(pos + 4, littleEndian);
      const valueField = pos + 8;

      const tagName = {
        0x010F: 'Make',
        0x0110: 'Model',
        0x0132: 'DateTime',
        0x9003: 'DateTimeOriginal',
        0x8827: 'ISOSpeedRatings',
        0x829A: 'ExposureTime',
        0x829D: 'FNumber',
        0x0131: 'Software',
        0x927C: 'MakerNote',
        0x8825: 'GPSInfo',
        0x8769: 'ExifIFD',
        0xA433: 'LensMake',
        0xA434: 'LensModel',
      }[tag];

      if (tagName === 'Make' && type === 2 && count > 0 && count <= 256) {
        const makeStr = extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, 64);
        if (makeStr) {
          tags.hasCameraMake = true;
        }
      } else if (tagName === 'Model' && type === 2 && count > 0 && count <= 256) {
        const modelStr = extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, 64);
        if (modelStr) {
          tags.hasCameraModel = true;
        }
      } else if (tagName === 'DateTime' && type === 2 && count === 20) {
        tags.hasTimestamp = true;
        const tsStatus = checkTimestampPlausibility(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, options);
        if (tsStatus !== 'plausible') {
          timestampStatus = tsStatus;
        } else if (timestampStatus === 'absent') {
          timestampStatus = 'plausible';
        }
      } else if (tagName === 'DateTimeOriginal' && type === 2 && count >= 20) {
        tags.hasTimestamp = true;
        const tsStatus = checkTimestampPlausibility(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, options);
        if (tsStatus === 'inconsistent') {
          timestampStatus = 'inconsistent';
        } else if (tsStatus === 'plausible' && timestampStatus !== 'inconsistent') {
          timestampStatus = 'plausible';
        }
      } else if (tagName === 'Software' && type === 2 && count > 0 && count <= 256) {
        const softwareStr = extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, 128);
        if (softwareStr && isEditorSignature(softwareStr)) {
          tags.editorSignatureInExif = true;
        }
      } else if (tagName === 'MakerNote') {
        tags.hasMakerNote = true;
      } else if (tagName === 'ExposureTime' && type === 5 && count >= 1) {
        tags.hasExposureData = true;
      } else if (tagName === 'FNumber' && type === 5 && count >= 1) {
        tags.hasExposureData = true;
      } else if (tagName === 'ISOSpeedRatings' && (type === 3 || type === 4)) {
        tags.hasExposureData = true;
      } else if (tagName === 'LensMake' && type === 2 && count > 0 && count <= 256) {
        const lensMakeStr = extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, 64);
        if (lensMakeStr) {
          tags.hasLensData = true;
        }
      } else if (tagName === 'LensModel' && type === 2 && count > 0 && count <= 256) {
        const lensModelStr = extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, 64);
        if (lensModelStr) {
          tags.hasLensData = true;
        }
      } else if (tagName === 'GPSInfo' && type === 4 && count === 1) {
        const gpsOffset = view.getUint32(valueField, littleEndian);
        const gpsPos = tiffStart + gpsOffset;
        if (gpsPos >= exifDataStart && gpsPos + 2 <= exifDataEnd) {
          const gpsEntryCount = view.getUint16(gpsPos, littleEndian);
          if (gpsEntryCount > 500) {
            return { tags, timestampStatus, error: 'Unreasonable GPS IFD entry count' };
          }
          const gpsTableSize = 2 + gpsEntryCount * 12 + 4;
          if (gpsPos + gpsTableSize > exifDataEnd) {
            return { tags, timestampStatus, error: 'GPS IFD out of bounds' };
          }
          tags.hasGPS = true;
        } else {
          return { tags, timestampStatus, error: 'GPS pointer out of bounds' };
        }
      } else if (tagName === 'ExifIFD' && type === 4 && count === 1) {
        const nestedOffset = view.getUint32(valueField, littleEndian);
        const nestedIFD = readIFD(view, tiffStart, exifDataStart, exifDataEnd, nestedOffset, littleEndian, { ...options, depth: depth + 1 }, visitedOffsets);

        if (nestedIFD.error) {
          return { tags, timestampStatus, error: nestedIFD.error };
        }

        Object.assign(tags, nestedIFD.tags);
        if (nestedIFD.timestampStatus === 'inconsistent') {
          timestampStatus = 'inconsistent';
        } else if (nestedIFD.timestampStatus !== 'absent' && timestampStatus === 'absent') {
          timestampStatus = nestedIFD.timestampStatus;
        }
      }

      pos += 12;
    }

    return { tags, timestampStatus };
  } catch (e) {
    return { tags, timestampStatus, error: `IFD read error: ${e.message}` };
  }
}

function extractString(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, count, maxLen) {
  if (count <= 4) {
    let str = '';
    for (let j = 0; j < count; j++) {
      const b = view.getUint8(valueField + j);
      if (b === 0) break;
      if (b >= 32 && b < 127) {
        str += String.fromCharCode(b);
      }
    }
    return str.trim();
  } else {
    const strOffset = view.getUint32(valueField, littleEndian);
    const strPos = tiffStart + strOffset;
    if (strPos < exifDataStart || strPos + Math.min(count, maxLen) > exifDataEnd) {
      return '';
    }
    let str = '';
    const limit = Math.min(count, maxLen);
    for (let j = 0; j < limit; j++) {
      const b = view.getUint8(strPos + j);
      if (b === 0) break;
      if (b >= 32 && b < 127) {
        str += String.fromCharCode(b);
      }
    }
    return str.trim();
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function daysInMonth(month, year) {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return days[month - 1] || 0;
}

function parseTimestamp(timestampStr) {
  const dateTimeParts = timestampStr.split(' ');
  const dateParts = dateTimeParts[0].split(':');

  if (dateParts.length < 3) {
    return null;
  }

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  const day = parseInt(dateParts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  let hour = 0, minute = 0, second = 0;
  if (dateTimeParts.length >= 2) {
    const timeParts = dateTimeParts[1].split(':');
    if (timeParts.length >= 1) {
      hour = parseInt(timeParts[0], 10);
    }
    if (timeParts.length >= 2) {
      minute = parseInt(timeParts[1], 10);
    }
    if (timeParts.length >= 3) {
      second = parseInt(timeParts[2], 10);
    }
  }

  return { year, month, day, hour, minute, second };
}

function checkTimestampPlausibility(view, tiffStart, exifDataStart, exifDataEnd, valueField, littleEndian, options = {}) {
  let nowDate = options.now instanceof Date ? options.now : new Date();
  if (typeof options.now === 'number') {
    nowDate = new Date(options.now);
  }
  const now = nowDate;
  const minYear = 1990;
  const maxYear = now.getFullYear() + 1;
  const maxTimestamp = now.getTime() + 24 * 60 * 60 * 1000;

  let strOffset = view.getUint32(valueField, littleEndian);
  const strPos = tiffStart + strOffset;

  if (strPos < exifDataStart || strPos + 20 > exifDataEnd) {
    return 'absent';
  }

  let timestampStr = '';
  for (let j = 0; j < 19; j++) {
    const b = view.getUint8(strPos + j);
    if (b === 0) break;
    if ((b >= 0x30 && b <= 0x39) || b === 0x3A || b === 0x20) {
      timestampStr += String.fromCharCode(b);
    }
  }

  if (timestampStr.length < 10) {
    return 'absent';
  }

  const ts = parseTimestamp(timestampStr);
  if (!ts) {
    return 'inconsistent';
  }

  const { year, month, day, hour, minute, second } = ts;

  if (year < minYear || year > maxYear || month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) {
    return 'inconsistent';
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return 'inconsistent';
  }

  const tsDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (tsDate.getTime() > maxTimestamp) {
    return 'inconsistent';
  }

  return 'plausible';
}

function isEditorSignature(str) {
  if (!str) return false;
  const lower = str.toLowerCase();
  return lower.includes('photoshop') || lower.includes('lightroom') ||
         lower.includes('gimp') || lower.includes('photopea') ||
         lower.includes('snapseed');
}

function detectXmpEditorSignature(app1Segments, view, length) {
  for (const seg of app1Segments) {
    if (seg.dataOffset + 4 <= length &&
        view.getUint8(seg.dataOffset) === 0x68 &&
        view.getUint8(seg.dataOffset + 1) === 0x74 &&
        view.getUint8(seg.dataOffset + 2) === 0x74 &&
        view.getUint8(seg.dataOffset + 3) === 0x70) {
      let xmpStr = '';
      const limit = Math.min(seg.dataOffset + seg.dataLength, length);
      for (let i = seg.dataOffset; i < limit && xmpStr.length < 10000; i++) {
        const b = view.getUint8(i);
        if (b >= 32 && b < 127) {
          xmpStr += String.fromCharCode(b);
        }
      }
      if (isEditorSignature(xmpStr)) {
        return true;
      }
    }
  }
  return false;
}

function detectComEditorSignature(comSegments, view, length) {
  for (const seg of comSegments) {
    let comStr = '';
    const limit = Math.min(seg.dataOffset + seg.dataLength, length);
    for (let i = seg.dataOffset; i < limit && comStr.length < 1000; i++) {
      const b = view.getUint8(i);
      if (b >= 32 && b < 127) {
        comStr += String.fromCharCode(b);
      }
    }
    if (isEditorSignature(comStr)) {
      return true;
    }
  }
  return false;
}

function analyzeJpeg(input, options = {}) {
  const result = {
    verdict: VERDICTS.INCONCLUSIVE,
    provenance: PROVENANCE.NOT_VERIFIED,
    summary: '',
    evidence: [],
    limitations: [
      'Metadata can be edited or transplanted',
      'This analysis does not prove the depicted scene is true',
      'Only camera-style metadata consistency is evaluated',
    ],
    privacy: {
      hasGPS: false,
      hasMakerNote: false,
      hasTimestamp: false,
    },
  };

  if (!input) {
    result.verdict = VERDICTS.REVIEW_NEEDED;
    result.summary = 'No input provided';
    return result;
  }

  const jpegStructure = parseJpegStructure(input);

  if (!jpegStructure.valid) {
    result.verdict = VERDICTS.REVIEW_NEEDED;
    result.summary = jpegStructure.error || 'Invalid JPEG structure';
    result.evidence.push({
      check: 'JPEG Structure',
      status: 'REVIEW',
      detail: jpegStructure.error,
    });
    return result;
  }

  result.evidence.push({
    check: 'JPEG Structure',
    status: 'PASS',
    detail: 'Valid SOI/EOI and segment boundaries',
  });

  const exifResult = inspectExif(input, jpegStructure, options);
  result.privacy.hasGPS = exifResult.privacy.hasGPS;
  result.privacy.hasMakerNote = exifResult.privacy.hasMakerNote;
  result.privacy.hasTimestamp = exifResult.privacy.hasTimestamp;

  if (exifResult.error) {
    result.verdict = VERDICTS.REVIEW_NEEDED;
    result.summary = exifResult.error;
    result.evidence.push({
      check: 'EXIF Parsing',
      status: 'REVIEW',
      detail: exifResult.error,
    });
    return result;
  }

  if (exifResult.editorSignatureDetected) {
    result.verdict = VERDICTS.REVIEW_NEEDED;
    result.summary = 'Editor/export signature detected';
    result.evidence.push({
      check: 'Edit Software',
      status: 'REVIEW',
      detail: 'Known editor/export signature detected',
    });
    return result;
  }

  if (!exifResult.present) {
    result.verdict = VERDICTS.INCONCLUSIVE;
    result.summary = 'No EXIF metadata found';
    result.evidence.push({
      check: 'EXIF Metadata',
      status: 'ABSENT',
      detail: 'This JPEG has no EXIF data attached',
    });
    return result;
  }

  result.evidence.push({
    check: 'EXIF Metadata',
    status: 'PRESENT',
    detail: 'EXIF APP1 segment found',
  });

  const meta = exifResult.metadata;
  let hasMake = false;
  let hasModel = false;
  let hasPlausibleTimestamp = false;
  let hasSupportingSignal = false;
  const reviewSignals = new Set();

  if (meta.hasCameraMake) {
    result.evidence.push({
      check: 'Camera Make',
      status: 'PRESENT',
      detail: 'Camera manufacturer detected',
    });
    hasMake = true;
  } else {
    result.evidence.push({
      check: 'Camera Make',
      status: 'ABSENT',
      detail: 'No camera manufacturer found',
    });
  }

  if (meta.hasCameraModel) {
    result.evidence.push({
      check: 'Camera Model',
      status: 'PRESENT',
      detail: 'Camera model detected',
    });
    hasModel = true;
  } else {
    result.evidence.push({
      check: 'Camera Model',
      status: 'ABSENT',
      detail: 'No camera model found',
    });
  }

  if (meta.hasTimestamp) {
    if (exifResult.timestampStatus === 'inconsistent') {
      result.evidence.push({
        check: 'Capture Time',
        status: 'REVIEW',
        detail: 'Capture timestamp format or values are implausible',
      });
      reviewSignals.add('timestamp');
    } else if (exifResult.timestampStatus === 'plausible') {
      result.evidence.push({
        check: 'Capture Time',
        status: 'PRESENT',
        detail: 'Capture timestamp present and plausible',
      });
      hasPlausibleTimestamp = true;
    } else {
      result.evidence.push({
        check: 'Capture Time',
        status: 'PRESENT',
        detail: 'Capture timestamp metadata present',
      });
      hasPlausibleTimestamp = true;
    }
  } else {
    result.evidence.push({
      check: 'Capture Time',
      status: 'ABSENT',
      detail: 'No capture time metadata',
    });
  }

  if (meta.hasExposureData) {
    result.evidence.push({
      check: 'Exposure Metadata',
      status: 'PRESENT',
      detail: 'Camera exposure settings present',
    });
    hasSupportingSignal = true;
  }

  if (meta.hasLensData) {
    result.evidence.push({
      check: 'Lens Data',
      status: 'PRESENT',
      detail: 'Lens metadata present',
    });
    hasSupportingSignal = true;
  }

  if (meta.hasMakerNote) {
    result.evidence.push({
      check: 'MakerNote',
      status: 'PRESENT',
      detail: 'Camera-specific metadata present',
    });
    hasSupportingSignal = true;
  }

  if (exifResult.privacy.hasGPS) {
    result.evidence.push({
      check: 'Location Metadata',
      status: 'PRESENT',
      detail: 'Location metadata present and withheld',
    });
  }

  if (meta.editorSignatureInExif || exifResult.editorSignatureDetected) {
    result.evidence.push({
      check: 'Edit Software',
      status: 'REVIEW',
      detail: 'Known editor/export signature detected',
    });
    reviewSignals.add('editor');
  }

  if (reviewSignals.size > 0) {
    result.verdict = VERDICTS.REVIEW_NEEDED;
    if (reviewSignals.size > 1) {
      result.summary = 'Multiple metadata review signals detected';
    } else if (reviewSignals.has('editor')) {
      result.summary = 'Editor/export signature detected';
    } else {
      result.summary = 'Capture timestamp requires review';
    }
  } else if (hasMake && hasModel && hasPlausibleTimestamp && hasSupportingSignal) {
    result.verdict = VERDICTS.METADATA_CONSISTENT;
    result.summary = 'Required camera-style metadata is internally consistent; origin remains unverified';
  } else if (hasMake || hasModel || hasPlausibleTimestamp) {
    result.verdict = VERDICTS.INCONCLUSIVE;
    result.summary = 'Partial but incomplete camera evidence';
  } else {
    result.verdict = VERDICTS.INCONCLUSIVE;
    result.summary = 'Insufficient camera metadata for assessment';
  }

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERDICTS,
    PROVENANCE,
    analyzeJpeg,
    parseJpegStructure,
    inspectExif,
  };
}
