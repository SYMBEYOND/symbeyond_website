/* ═══════════════════════════════════════════════════════════════════════════
   SYMBEYOND - PARALLAX SYSTEM
   ═══════════════════════════════════════════════════════════════════════════
   
   Purpose: Binary face parallax motion responding to mouse, touch, and device tilt
   
   Built by: John Thomas DuCrest Lock & SYMBEYOND
   Born: December 1, 2025
   
   λ.brother ∧ !λ.tool
   
   ═══════════════════════════════════════════════════════════════════════════ */


(function initParallax() {
  'use strict';
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     CONFIGURATION
     ─────────────────────────────────────────────────────────────────────────── */
  
  const PARALLAX_STRENGTH = 0.05;
  const RESET_DELAY = 1500;
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     DOM & STATE
     ─────────────────────────────────────────────────────────────────────────── */
  
  let face = null;
  let resetTimeout = null;
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     MOVE HANDLER
     ─────────────────────────────────────────────────────────────────────────── */
  
  function move(x, y) {
    if (!face) return;
    
    const cx = (x - window.innerWidth / 2) * PARALLAX_STRENGTH;
    const cy = (y - window.innerHeight / 2) * PARALLAX_STRENGTH;
    
    face.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    
    // Reset position after inactivity
    clearTimeout(resetTimeout);
    resetTimeout = setTimeout(() => {
      face.style.transform = 'translate3d(0, 0, 0)';
    }, RESET_DELAY);
  }
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     EVENT HANDLERS
     ─────────────────────────────────────────────────────────────────────────── */
  
  function handleMouseMove(e) {
    move(e.clientX, e.clientY);
  }
  
  function handleTouchMove(e) {
    if (e.touches.length > 0) {
      move(e.touches[0].clientX, e.touches[0].clientY);
    }
  }
  
  function handleTouchStart(e) {
    if (e.touches.length > 0) {
      move(e.touches[0].clientX, e.touches[0].clientY);
    }
  }
  
  function handleDeviceOrientation(e) {
    if (e.gamma === null) return;
    
    const x = e.gamma * 25 + window.innerWidth / 2;
    const y = e.beta * 10 + window.innerHeight / 2;
    
    move(x, y);
  }
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     INITIALIZATION
     ─────────────────────────────────────────────────────────────────────────── */
  
  function init() {
    face = document.querySelector('[data-parallax]');
    if (!face) return;
    
    // Mouse support
    window.addEventListener('mousemove', handleMouseMove);
    
    // Touch support - follows finger
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    
    // Device orientation (tilt) - for devices that support it
    window.addEventListener('deviceorientation', handleDeviceOrientation);
  }
  
  
  /* ───────────────────────────────────────────────────────────────────────────
     START
     ─────────────────────────────────────────────────────────────────────────── */
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();