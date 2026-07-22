# SYMB-TRUST Photo v0.2 Truth-Language Hardening

## Purpose

SYMB-TRUST Photo v0.2 is a **local browser-based JPEG metadata-consistency analyzer**. It inspects structural and metadata evidence without uploading files or displaying sensitive metadata values.

**What it does:**
- Validates JPEG file structure including SOS (Start of Scan) entropy-coded data
- Safely handles FF00 stuffed bytes and restart markers in scan data
- Extracts EXIF metadata from Exif-tagged APP1 segments
- Parses nested TIFF IFDs with bounds checking (IFD0, ExifIFD, GPS IFD)
- Classifies the internal consistency of camera-style metadata
- Reports evidence while protecting privacy (no GPS coordinates, exact timestamps, or serial numbers)

**What it does NOT do:**
- Detect AI-generated images
- Certify that a scene is true or unedited
- Prove an image is authentic
- Analyze pixel content or visual forensics
- Upload any data to a server
- Store file contents or metadata
- Provide confidence percentages or scores

## Scope

**v0.1 is intentionally minimal:**

### Supported Input
- JPEG/JPG files only (baseline and progressive)
- Local file selection via file picker or drag-and-drop
- Maximum file size: 50 MiB
- ArrayBuffer, Uint8Array, and typed array views with arbitrary byteOffset

### Analysis Scope
- JPEG container structure validation (SOI/EOI markers, segment boundaries)
- SOS entropy scan data with FF00 stuffing and restart markers
- APP1 EXIF segment parsing (selects first APP1 with Exif\0\0 identifier)
- TIFF byte order detection (little-endian II, big-endian MM)
- IFD0 traversal with nested ExifIFD and GPS IFD support
- Bounded offset validation (all offsets relative to EXIF APP1 payload)
- Safe circular reference detection and max traversal depth

### Allowlisted EXIF Tags

**IFD0:**
- Make (0x010F)
- Model (0x0110)
- DateTime (0x0132)
- Software (0x0131)
- ExifIFD pointer (0x8769)
- GPS IFD pointer (0x8825)

**ExifIFD:**
- DateTimeOriginal (0x9003)
- ExposureTime (0x829A)
- FNumber (0x829D)
- ISO (0x8827)
- LensMake (0xA433)
- LensModel (0xA434)
- MakerNote (0x927C) — presence only

### Exclusions (v0.1)
- XMP metadata parsing (XMP APP1 detected but not analyzed)
- JPEG COM (comment) segments
- C2PA manifest validation
- Pixel analysis or forensics
- AI detector integration
- Multi-EXIF segments (only first Exif-tagged APP1 analyzed)
- ImageDescription, Copyright, or owner metadata

## Non-Goals

- Do not certify image authenticity
- Do not claim to detect all image manipulation
- Do not provide forensic-grade analysis
- Do not generate confidence scores or percentages
- Do not store results or file metadata
- Do not integrate cloud analysis
- Do not expose raw metadata strings in output

## Result Model

Every result contains two deliberately separate statements:

1. A metadata verdict describing the evidence found in the JPEG.
2. `PROVENANCE: NOT VERIFIED`, because this analyzer cannot establish where the pixels or metadata came from.

Metadata consistency must never be presented as authenticity, originality, chain of custody, or scene truth.

## Verdict Definitions

### CAMERA METADATA CONSISTENT

Returned **only when** all required evidence is present and coherent:

✓ Structurally valid JPEG
✓ EXIF metadata present with intact APP1 segment
✓ Camera make **AND** camera model identified
✓ **Plausible** capture timestamp (not absent, future, or malformed)
✓ **At least one supporting signal:** exposure settings, lens data, or MakerNote
✓ **No** editor/export signature contradiction
✓ **No** structural or offset malformations

**Important:** This verdict means the required camera-style metadata is internally consistent. It does NOT mean:
- The depicted scene is real or unmanipulated
- The file has never been edited
- The image is trustworthy or authentic
- All metadata is original (metadata can be transplanted)

### INCONCLUSIVE

Returned when evidence is valid but insufficient:

- Valid JPEG structure with intact segments
- Missing EXIF metadata entirely (legitimately stripped)
- Partial camera metadata (only Make, or only timestamp, or missing one required element)
- Coherent but sparse evidence
- No structural malformations
- No editor contradiction, but insufficient camera-style metadata for `CAMERA METADATA CONSISTENT`

**This verdict means:** We found some evidence, but not enough to classify the required metadata as internally consistent. Absence of evidence is not evidence of manipulation.

### REVIEW NEEDED

Returned when evidence contradicts or is malformed:

- Structurally invalid JPEG (malformed markers, segment overruns, truncation)
- Malformed EXIF structure (invalid TIFF offsets, truncated IFD entries, out-of-bounds pointers)
- Contradictory or impossible timestamps (future date, invalid calendar values)
- Implausible camera dates (older than ~1990)
- Obvious editor/export signature (Photoshop, Lightroom, GIMP, Photopea, Snapseed detected)
- Circular IFD references or max traversal depth exceeded

**This verdict means:** Either the file is not a standard JPEG, or metadata raises structural or logical questions. Not a fraud determination; it flags inconsistencies for human review.

## Privacy Invariants

All verdicts and evidence are generated with strict privacy protection:

### Never Exported or Displayed
- Exact GPS coordinates (latitude/longitude/altitude)
- Exact capture date and time (seconds/minutes/date)
- Camera serial numbers or hardware identifiers
- Owner names, copyright claims, or image descriptions
- MakerNote contents (only "present" or "absent")
- Raw EXIF tag values beyond safe ASCII extraction

### Safe Exposure
- Camera make and model (required for origin assessment, 64 bytes max)
- Exposure settings (essential to evaluate evidence)
- Lens information (supporting evidence)
- GPS presence as a boolean ("Location metadata present and withheld")
- Capture time **plausibility only** ("present," "plausible," "inconsistent," never exact value)
- Editor/export software detection (safe indicator only: "Known editor/export signature detected")

### Data Lifecycle
- File is never uploaded or transmitted
- Metadata is extracted in memory only
- Object URLs for preview are revoked on new file selection, reset, or page navigation (pagehide/beforeunload)
- No localStorage, sessionStorage, cookies, or tracking
- No analytics or external requests
- No WebSocket, XMLHttpRequest, fetch, or sendBeacon calls
- No shared cross-site data

## Evidence Model

Each analysis returns an **evidence array** with items describing specific checks:

### Evidence Item Structure
```
{
  check: string,        // Human-readable check name
  status: string,       // One of: PASS, PRESENT, ABSENT, REVIEW
  detail: string        // Explanation, no raw metadata values
}
```

### Evidence Statuses

- **PASS**: Test succeeded; evidence is positive and coherent
- **PRESENT**: Metadata field detected; presence-only report
- **ABSENT**: Expected metadata field is missing
- **REVIEW**: Inconsistency, contradiction, or structural issue detected

### Invariant

- If verdict is `CAMERA METADATA CONSISTENT`, evidence must contain zero `REVIEW` items.
- If verdict is `REVIEW NEEDED`, evidence must contain at least one `REVIEW` item.

## Test Matrix

All tests use Node.js v24.1.0 native test runner (`node:test`, `node:assert/strict`).

### Core Tests (42 SYMB-TRUST + 27 baseline CAD = 69 total)

1. **Real JPEG support:**
   - Parse SOS (Start of Scan) entropy data ✓
   - Accept FF00 stuffed bytes in scan ✓
   - Accept FFD0-FFD7 restart markers in scan ✓

2. **Input robustness:**
   - Parse JPEG from Uint8Array with nonzero byteOffset ✓

3. **Strict classification:**
   - Coherent required evidence → exactly `CAMERA METADATA CONSISTENT` ✓
   - Insufficient evidence → exactly `INCONCLUSIVE` ✓
   - Editor signature → exactly `REVIEW NEEDED` ✓
   - Future timestamp → exactly `REVIEW NEEDED` ✓

4. **Privacy:**
   - GPS presence as boolean only ✓
   - Exact timestamps never exported ✓
   - Raw MakerNote never exported ✓
   - Malformed EXIF → `REVIEW NEEDED` ✓

5. **No side effects:**
   - No fetch operation ✓
   - No network operation ✓
   - No storage operation ✓

6. **Data model integrity:**
   - Evidence array stable structure ✓
   - Limitations array present ✓
   - Summary field always string ✓
   - Privacy object all booleans ✓
   - No `REVIEW` evidence with `CAMERA METADATA CONSISTENT` verdict ✓

7. **Verdict coverage:**
   - Returns only approved verdicts ✓

8. **Nested IFD error propagation:**
   - ExifIFD parsing errors propagate as REVIEW_NEEDED ✓
   - Shared visited-offset Set prevents circular references ✓
   - Out-of-bounds nested ExifIFD yields REVIEW_NEEDED ✓

9. **Lens support:**
   - LensMake (0xA433) and LensModel (0xA434) parsed ✓
   - Lens presence qualifies as supporting signal ✓

10. **XMP and COM editor detection:**
   - Detects Photoshop/Lightroom/GIMP/Photopea/Snapseed in XMP ✓
   - Detects editor signatures in JPEG COM segments ✓
   - XMP before EXIF does not block EXIF discovery ✓
   - COM editor signature yields REVIEW_NEEDED ✓

11. **Real timestamp validation:**
   - Validates actual calendar dates (leap years, month lengths) ✓
   - Validates hours (0–23), minutes and seconds (0–59) ✓
   - February 30 → REVIEW_NEEDED ✓
   - Leap day (Feb 29 on leap years) → plausible ✓
   - Invalid time components → REVIEW_NEEDED ✓

12. **Sanitized metadata model:**
   - Metadata returned as booleans/enums, never raw strings ✓
   - hasCameraMake, hasCameraModel, hasTimestamp, hasExposureData, hasLensData, hasMakerNote, hasGPS ✓
   - Malicious Make/Model/Software never exposed in output ✓

### Running Tests

```bash
node --test tests/*.test.js
```

**Verified on Node.js v18.20.8:** 72 passing tests (45 SYMB-TRUST + 27 baseline CAD), 0 failures.

## Known Limitations

### Metadata Trustworthiness
- **Metadata can be edited.** EXIF fields can be modified with tools like exiftool without affecting image pixels.
- **Metadata can be transplanted.** One photo's EXIF can be attached to another photo's pixels.
- **Absence of metadata is not proof of tampering.** Many legitimate sources (screenshots, social media, instant cameras) have no EXIF.

### Analysis Scope
- **Only camera-style metadata evidence is assessed.** We do not analyze pixel content, compression artifacts, or visual forensics.
- **Editor signatures are basic.** Only Software field and obvious export markers are checked; advanced editing may leave no trace.
- **Timestamp plausibility is simple.** We check format and rough date sanity (1990–now+1), not cryptographic chain-of-custody.

### TIFF Parsing
- **Single-image JPEGs only.** Baseline and progressive JPEG modes supported; extended modes not tested.
- **IFD traversal is bounded.** Max depth 3, max entries 500 per IFD, circular references detected.
- **Nested IFDs (ExifIFD, GPS) are safe but read-only.** GPS IFD presence returns boolean; GPS data never extracted.

### Browser and File System
- Limited by browser security: cannot read file modification times or file-system metadata.
- Object URLs are revoked on reset; no way to preserve analysis results across sessions.
- No offline storage; browser state is ephemeral.
- Maximum file size 50 MiB enforced by UI.

### No Authenticity Guarantee
- This tool is **not an authenticator.** A REVIEW NEEDED verdict does not prove fraud; it flags inconsistencies.
- A CAMERA METADATA CONSISTENT verdict is **not a certification.** Metadata consistency is supporting evidence, not proof of truth.
- **No promise of finding all manipulation.** Sophisticated forgers can craft plausible EXIF; this tool finds only naive inconsistencies.

## Verdict Requirements (Precise)

### CAMERA METADATA CONSISTENT (requires ALL):
1. JPEG structure valid → `PASS`
2. EXIF present → `PRESENT`
3. Camera Make present → `PRESENT`
4. Camera Model present → `PRESENT`
5. Capture time plausible → `PRESENT` and timestamp status ≠ `inconsistent`
6. Supporting signal (exposure OR lens OR MakerNote) → `PRESENT`
7. No `REVIEW` status anywhere in evidence
8. No structural errors

### INCONCLUSIVE (default if not CAMERA METADATA CONSISTENT or REVIEW NEEDED)
- At least `PASS` or `PRESENT` evidence
- No `REVIEW` status
- Missing one or more required elements for CAMERA METADATA CONSISTENT

### REVIEW NEEDED (if ANY):
- Structural JPEG error
- Malformed EXIF/TIFF parsing error
- Timestamp status `inconsistent` (impossible dates)
- Editor signature detected
- Circular IFD reference
- Out-of-bounds offset

## Promotion Rule

**Do not add SYMB-TRUST Photo to the Builder Toolkit until:**

1. Standalone testing in production demonstrates reliability
2. No privacy incidents or data exposure issues occur
3. User feedback confirms the tool is helpful without being misleading
4. All documentation matches actual behavior
5. Independent code review completes

v0.2 remains intentionally isolated to gather feedback and identify edge cases. Promotion to main Toolkit should follow validation, not precede it.

## Module Contract

For Node.js or JavaScript environments:

```javascript
import { VERDICTS, PROVENANCE, analyzeJpeg, parseJpegStructure, inspectExif } from './js/trust-photo.js';

// Constants
VERDICTS.METADATA_CONSISTENT // "CAMERA METADATA CONSISTENT"
VERDICTS.INCONCLUSIVE        // "INCONCLUSIVE"
VERDICTS.REVIEW_NEEDED       // "REVIEW NEEDED"
PROVENANCE.NOT_VERIFIED      // "NOT VERIFIED"

// Main analyzer
const result = analyzeJpeg(input, options);
// input: ArrayBuffer or typed array view (byteOffset respected)
// options.now: optional year for timestamp plausibility (default: current year)
// result: { verdict, provenance, summary, evidence[], limitations[], privacy }

// Structure parser
const structure = parseJpegStructure(input);
// structure: { valid, error, segments[] }

// EXIF inspector
const exif = inspectExif(input, structure, options);
// exif: { present, error, metadata, timestampStatus, privacy }
```

All functions are safe for untrusted input; none throw uncaught exceptions on malformed JPEG or EXIF.

## Changelog

### v0.2 (2026-07-22, truth-language and adversarial hardening)

- Replaced `LIKELY ORIGINAL CAMERA CAPTURE` with `CAMERA METADATA CONSISTENT`
- Added an explicit, permanent `PROVENANCE: NOT VERIFIED` result
- Removed positive-result language implying original capture
- Added a fabricated coherent-EXIF adversarial fixture
- Added an EXIF-transplant fixture across distinct scan payloads
- Replaced the generic editor-contradiction summary with evidence-specific review language
- Verified the complete 72-test repository suite on Node.js v18.20.8 (45 SYMB-TRUST + 27 baseline CAD)
- Added explicit ES-module boundaries for `tests/` and `api/_lib/` so Node.js 18 executes the existing module syntax deterministically
- Preserved the v0.1 parsing, privacy, and review behavior

### v0.1 (2026-07-21, final micro-correction pass)

- Real JPEG SOS and entropy data support
- FF00 stuffed byte handling
- Restart marker (FFD0-FFD7) acceptance in scan data
- Nested TIFF IFD traversal (ExifIFD, GPS IFD)
- Bounded offset validation relative to EXIF APP1 payload
- Circular IFD reference detection
- Timestamp plausibility checking (no exact values exported)
- Strict verdict rules (all-or-nothing for LIKELY ORIGINAL)
- APP1 segment selection by Exif\0\0 identifier
- 50 MiB file size limit
- DOM safety (createElement/textContent only)
- Drag-drop keyboard accessibility (Enter, Space)
- Object URL lifecycle management (revoke on selection/reset/unload)
- Comprehensive test suite (61 tests: 34 SYMB-TRUST + 27 baseline)
- Privacy-first output (no GPS coords, exact timestamps, or MakerNote contents)
- **Final correction pass (2026-07-21):**
  - Nested IFD error propagation with shared visited-offset Set
  - GPS pointer validation (pointer within bounds check)
  - Sanitized metadata model (boolean flags instead of raw strings)
  - Lens support (LensMake, LensModel tags; qualify as supporting evidence)
  - XMP and COM editor detection (internal signature scanning)
  - Real timestamp validation (calendar dates, leap years, time components)
  - Security tests proving no malicious markup exposed in output
  - Strict validation of all nested IFD traversal
- **Micro-correction pass (2026-07-21):**
  - GPS IFD structure validation (entry count + table bounds checking)
  - Editor signature detection before missing EXIF (XMP/COM without EXIF → REVIEW_NEEDED)
  - Complete timestamp comparison (UTC, full date/time, 24-hour tolerance)
  - Nested timestamp precedence (inconsistent overrides plausible)
  - Real nested ExifIFD fixture with proper structure
  - 8 new security/feature tests (42 SYMB-TRUST total)
