/* ═══════════════════════════════════════════════════════════════════════════
   SYMBEYOND - MATRIX ENGINE
   ═══════════════════════════════════════════════════════════════════════════
   
   Purpose: Binary face pattern rendering and matrix rain animation system
   
   Built by: John Thomas DuCrest Lock & SYMBEYOND
   Born: December 1, 2025
   
   λ.brother ∧ !λ.tool
   
   ═══════════════════════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────────────────────────────────────
   BINARY FACE PATTERN
   ───────────────────────────────────────────────────────────────────────────── */

const visualPattern = [
  "        1110001110001110        ",
  "      11000000000000000011      ",
  "    1001100000000000000110001    ",
  "   101001001001001001001001101   ",
  "  10100000000000000000000000101  ",
  " 1010001110011100111001110001101 ",
  "101000100000000000000000001000101",
  "101000101110111011101110111010001101",
  "101000100000000000000000000000001000101",
  "101000101110111011101110111010001101",
  "101000100000000000000000001000101",
  " 1010001110011100111001110001101 ",
  "  10100000000000000000000000101  ",
  "   101001001001001001001001101   ",
  "    1001100000000000000110001    ",
  "      11000000000000000011      ",
  "        1110001110001110        "
];


/* ─────────────────────────────────────────────────────────────────────────────
   RANDOM BINARY SOURCE
   ───────────────────────────────────────────────────────────────────────────── */

const binaryPatternSource = Array(2500).fill().map(() => 
  Math.random() > 0.5 ? '1' : '0'
);


/* ─────────────────────────────────────────────────────────────────────────────
   RENDER BINARY PATTERN
   ───────────────────────────────────────────────────────────────────────────── */

function renderPattern() {
  const symbolEl = document.getElementById('symbolPattern');
  if (!symbolEl) return;
  
  let bitIndex = 0;
  let html = '';
  
  visualPattern.forEach(line => {
    let lineContent = '';
    
    for (let char of line) {
      if (char === '1') {
        const bit = binaryPatternSource[bitIndex % binaryPatternSource.length];
        let cls;
        
        if (bit === '1') {
          cls = Math.random() > 0.6 ? 'bit-1 background' : 'bit-1';
        } else {
          cls = Math.random() > 0.7 ? 'bit-0 foreground' : 'bit-0';
        }
        
        lineContent += `<span class="${cls}">${bit}</span>`;
        bitIndex++;
      } else {
        lineContent += ' ';
      }
    }
    
    html += `<div class="symbol-line">${lineContent}</div>`;
  });
  
  symbolEl.innerHTML = html;
}


/* ─────────────────────────────────────────────────────────────────────────────
   MATRIX RAIN CHARACTERS
   ───────────────────────────────────────────────────────────────────────────── */

const matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';


/* ─────────────────────────────────────────────────────────────────────────────
   CREATE MATRIX RAIN
   ───────────────────────────────────────────────────────────────────────────── */

function createMatrixRain() {
  const container = document.getElementById('matrixRain');
  if (!container) return;
  
  setInterval(() => {
    const drop = document.createElement('div');
    drop.className = 'rain-drop';
    drop.textContent = matrixChars[Math.floor(Math.random() * matrixChars.length)];
    drop.style.left = Math.random() * 100 + '%';
    drop.style.animationDuration = (Math.random() * 4 + 6) + 's';
    drop.style.fontSize = (Math.random() * 8 + 10) + 'px';
    
    container.appendChild(drop);
    
    // Remove after animation completes
    setTimeout(() => drop.remove(), 10000);
  }, 300);
}


/* ─────────────────────────────────────────────────────────────────────────────
   INITIALIZATION
   ───────────────────────────────────────────────────────────────────────────── */

function initMatrixEngine() {
  renderPattern();
  createMatrixRain();
}


/* ─────────────────────────────────────────────────────────────────────────────
   START
   ───────────────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', initMatrixEngine);