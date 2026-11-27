/**
 * Generates a realistic, high-contrast 480x270 FLIR / Drone Recon Tactical Frame
 * of SECTOR 2 · HARBOR BRIDGE NORTH RAMP using an offscreen HTML5 <canvas>.
 *
 * Exported as `image/jpeg` (quality 0.82, guaranteed < 28 KB) so it attaches
 * directly as a valid Firebase AI Logic multimodal `InlineDataPart` for
 * `InferenceMode.ONLY_IN_CLOUD` (Gemini 2.5 Flash vision fusion).
 */

let cachedReconDataUrl: string | null = null;

function drawRoundedPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.round((base64.length * 3) / 4);
}

export function generateSampleHazardReconDataUrl(): string {
  if (cachedReconDataUrl) return cachedReconDataUrl;

  if (typeof document === 'undefined') {
    return '';
  }

  const W = 480;
  const H = 270;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Dark satellite-slate base terrain
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0C1219');
  bgGrad.addColorStop(0.5, '#121A24');
  bgGrad.addColorStop(1, '#0D141C');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle North & South landmass blocks (urban arterial blocks in FLIR monochrome)
  ctx.fillStyle = '#17212D';
  const urbanBlocks: Array<[number, number, number, number]> = [
    [18, 28, 72, 34],
    [102, 26, 76, 38],
    [258, 28, 86, 36],
    [358, 30, 96, 34],
    [22, 194, 84, 42],
    [118, 198, 66, 38],
    [268, 192, 78, 32],
    [358, 190, 98, 34],
  ];
  for (const [bx, by, bw, bh] of urbanBlocks) {
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }

  // 2. Coastal Water Channel cutting across mid-frame
  ctx.beginPath();
  ctx.moveTo(0, 94);
  ctx.bezierCurveTo(130, 86, 310, 102, W, 90);
  ctx.lineTo(W, 174);
  ctx.bezierCurveTo(320, 184, 150, 168, 0, 178);
  ctx.closePath();
  const waterGrad = ctx.createLinearGradient(0, 88, 0, 182);
  waterGrad.addColorStop(0, '#060C14');
  waterGrad.addColorStop(0.5, '#091523');
  waterGrad.addColorStop(1, '#060D16');
  ctx.fillStyle = waterGrad;
  ctx.fill();

  // Shoreline embankments
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 94);
  ctx.bezierCurveTo(130, 86, 310, 102, W, 90);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 178);
  ctx.bezierCurveTo(150, 168, 320, 184, W, 174);
  ctx.stroke();

  // Subtle water current lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (const wy of [112, 134, 156]) {
    ctx.beginPath();
    ctx.moveTo(24, wy);
    ctx.bezierCurveTo(160, wy - 5, 310, wy + 6, W - 24, wy - 2);
    ctx.stroke();
  }

  // 3. Satellite-slate coordinate grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = 40; gx < W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 30; gy < H; gy += 30) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // 4. Secondary roads (North Ave blocked feeder & Pine St South clear arterial)
  // North Ave horizontal feeder
  ctx.strokeStyle = '#263241';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(16, 48);
  ctx.lineTo(464, 48);
  ctx.stroke();

  // Pine St South arterial
  ctx.strokeStyle = '#283646';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(16, 224);
  ctx.quadraticCurveTo(240, 212, 466, 226);
  ctx.stroke();

  // 5. Harbor Bridge Deck (Intact South Span + Fractured North Span)
  // Intact South & Mid Bridge Span (y: 112 -> 244)
  ctx.fillStyle = '#2C394B';
  ctx.beginPath();
  ctx.moveTo(198, 114);
  ctx.lineTo(238, 114);
  ctx.lineTo(246, 242);
  ctx.lineTo(204, 242);
  ctx.closePath();
  ctx.fill();

  // Bridge guardrails & center divider on intact south span
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.48)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(198, 114);
  ctx.lineTo(204, 242);
  ctx.moveTo(238, 114);
  ctx.lineTo(246, 242);
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(218, 118);
  ctx.lineTo(225, 238);
  ctx.stroke();
  ctx.restore();

  // North Approach stub before fracture (y: 26 -> 74)
  ctx.fillStyle = '#2A3544';
  ctx.beginPath();
  ctx.moveTo(194, 26);
  ctx.lineTo(234, 26);
  ctx.lineTo(236, 74);
  ctx.lineTo(196, 78);
  ctx.closePath();
  ctx.fill();

  // Jagged Collapsed Gap (y: 74 -> 114) exposing dark water & twisted girders
  ctx.fillStyle = '#050A10';
  ctx.beginPath();
  ctx.moveTo(194, 76);
  ctx.lineTo(208, 83);
  ctx.lineTo(221, 74);
  ctx.lineTo(238, 81);
  ctx.lineTo(240, 114);
  ctx.lineTo(224, 108);
  ctx.lineTo(210, 116);
  ctx.lineTo(196, 110);
  ctx.closePath();
  ctx.fill();

  // Exposed fractured concrete slabs & rubble blocking North Ramp
  const debrisChunks: Array<[number, number, number, number, string]> = [
    [198, 66, 13, 8, '#64748B'],
    [215, 68, 16, 9, '#94A3B8'],
    [203, 86, 14, 10, '#475569'],
    [222, 92, 12, 9, '#64748B'],
    [190, 56, 11, 7, '#64748B'],
    [226, 58, 12, 7, '#94A3B8'],
  ];
  for (const [dx, dy, dw, dh, col] of debrisChunks) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(((dx + dy) % 7) * 0.18 - 0.4);
    ctx.fillStyle = col;
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  // 4 stranded vehicle thermal signatures near north shoulder
  const cars: Array<[number, number]> = [
    [202, 44],
    [221, 49],
    [205, 127],
    [226, 133],
  ];
  for (const [cx, cy] of cars) {
    ctx.fillStyle = '#F2B84B';
    ctx.fillRect(cx - 4, cy - 7, 8, 13);
    ctx.fillStyle = '#FFF7CC';
    ctx.fillRect(cx - 2.5, cy - 5, 5, 4);
  }

  // 6. Glowing Thermal-Amber / Coral Heat Plume on fractured North Span + Gas Rupture
  const plumeX = 216;
  const plumeY = 86;
  const outerPlume = ctx.createRadialGradient(
    plumeX,
    plumeY,
    4,
    plumeX,
    plumeY,
    54
  );
  outerPlume.addColorStop(0, 'rgba(255, 251, 220, 0.98)');
  outerPlume.addColorStop(0.22, 'rgba(242, 184, 75, 0.90)');
  outerPlume.addColorStop(0.52, 'rgba(232, 93, 74, 0.62)');
  outerPlume.addColorStop(0.82, 'rgba(232, 93, 74, 0.18)');
  outerPlume.addColorStop(1, 'rgba(232, 93, 74, 0)');
  ctx.fillStyle = outerPlume;
  ctx.beginPath();
  ctx.arc(plumeX, plumeY, 54, 0, Math.PI * 2);
  ctx.fill();

  // Secondary drifted thermal smoke lobe
  const driftPlume = ctx.createRadialGradient(186, 74, 2, 186, 74, 30);
  driftPlume.addColorStop(0, 'rgba(242, 184, 75, 0.72)');
  driftPlume.addColorStop(0.55, 'rgba(232, 93, 74, 0.36)');
  driftPlume.addColorStop(1, 'rgba(232, 93, 74, 0)');
  ctx.fillStyle = driftPlume;
  ctx.beginPath();
  ctx.arc(186, 74, 30, 0, Math.PI * 2);
  ctx.fill();

  // Dashed Coral Tactical Breach Box around fractured north span
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#E85D4A';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(182, 54, 68, 66);
  ctx.restore();

  // Red blocked X marker on North Ramp
  ctx.strokeStyle = '#FF6B57';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(209, 60);
  ctx.lineTo(223, 74);
  ctx.moveTo(223, 60);
  ctx.lineTo(209, 74);
  ctx.stroke();

  // 7. Green Clear-Corridor Vector along PINE ST SOUTH APPROACH (CLEAR)
  ctx.save();
  ctx.shadowColor = 'rgba(183, 232, 82, 0.75)';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#B7E852';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(436, 225);
  ctx.quadraticCurveTo(318, 217, 250, 214);
  ctx.quadraticCurveTo(226, 212, 223, 176);
  ctx.stroke();
  ctx.restore();

  // Arrowhead pointing north onto intact South Bridge approach
  ctx.fillStyle = '#B7E852';
  ctx.beginPath();
  ctx.moveTo(223, 167);
  ctx.lineTo(216, 180);
  ctx.lineTo(230, 180);
  ctx.closePath();
  ctx.fill();

  // Directional chevrons along Pine St corridor
  for (const cx of [386, 332, 280]) {
    ctx.strokeStyle = '#B7E852';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 5, 214);
    ctx.lineTo(cx, 219);
    ctx.lineTo(cx + 5, 224);
    ctx.stroke();
  }

  // 8. Callout Leader + Pill: GAS/DEBRIS THERMAL ANOMALY · 148°C
  ctx.strokeStyle = '#F2B84B';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(232, 82);
  ctx.lineTo(258, 66);
  ctx.lineTo(268, 66);
  ctx.stroke();

  drawRoundedPill(ctx, 268, 54, 194, 24, 6);
  ctx.fillStyle = 'rgba(14, 17, 21, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 184, 75, 0.75)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.fillStyle = '#F2B84B';
  ctx.font = 'bold 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('GAS/DEBRIS THERMAL ANOMALY · 148°C', 275, 69);

  // Secondary North Span Blocked callout on left
  ctx.strokeStyle = '#E85D4A';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(182, 86);
  ctx.lineTo(164, 86);
  ctx.stroke();

  drawRoundedPill(ctx, 18, 74, 146, 22, 6);
  ctx.fillStyle = 'rgba(14, 17, 21, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 93, 74, 0.75)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.fillStyle = '#FF7A68';
  ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('NORTH SPAN COLLAPSED', 26, 88);

  // Clear-corridor HUD pill: PINE ST SOUTH APPROACH (CLEAR)
  drawRoundedPill(ctx, 250, 186, 198, 23, 6);
  ctx.fillStyle = 'rgba(14, 17, 21, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(183, 232, 82, 0.78)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#B7E852';
  ctx.font = 'bold 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('PINE ST SOUTH APPROACH (CLEAR)', 258, 201);

  // 9. FLIR Right-Edge Thermal Calibration Bar
  const barX = 462;
  const barY = 98;
  const barH = 74;
  const thermBar = ctx.createLinearGradient(0, barY, 0, barY + barH);
  thermBar.addColorStop(0, '#FFFBEB');
  thermBar.addColorStop(0.3, '#F2B84B');
  thermBar.addColorStop(0.65, '#E85D4A');
  thermBar.addColorStop(1, '#1E293B');
  ctx.fillStyle = thermBar;
  ctx.fillRect(barX, barY, 6, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(barX, barY, 6, barH);

  // 10. Top & Bottom Tactical HUD Telemetry Strips + Corner Reticles
  ctx.fillStyle = 'rgba(10, 13, 17, 0.84)';
  ctx.fillRect(0, 0, W, 24);
  ctx.fillRect(0, H - 24, W, 24);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(W, 24);
  ctx.moveTo(0, H - 24);
  ctx.lineTo(W, H - 24);
  ctx.stroke();

  // Live FLIR dot + Sector title
  ctx.fillStyle = '#E85D4A';
  ctx.beginPath();
  ctx.arc(13, 12, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F3F4F6';
  ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('SECTOR 2 · HARBOR BRIDGE NORTH RAMP', 22, 15.5);

  ctx.fillStyle = '#B7E852';
  ctx.font = 'bold 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  ctx.fillText('DRONE-RECON-04 · INLINE_DATA_PART', W - 10, 15.5);

  // Bottom GPS + Timestamp
  ctx.textAlign = 'left';
  ctx.fillStyle = '#D1D5DB';
  ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('GPS 37.8247°N 122.4755°W · FLIR EO/IR', 10, H - 8.5);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('2026-11-27T08:14:22Z · ONLY_IN_CLOUD', W - 10, H - 8.5);
  ctx.textAlign = 'left';

  // 4 Corner HUD L-Reticles
  ctx.strokeStyle = 'rgba(183, 232, 82, 0.78)';
  ctx.lineWidth = 1.6;
  const rPadX = 10;
  const rTop = 31;
  const rBot = H - 31;
  const rLen = 12;

  ctx.beginPath();
  // Top-left
  ctx.moveTo(rPadX, rTop + rLen);
  ctx.lineTo(rPadX, rTop);
  ctx.lineTo(rPadX + rLen, rTop);
  // Top-right
  ctx.moveTo(W - rPadX - rLen, rTop);
  ctx.lineTo(W - rPadX, rTop);
  ctx.lineTo(W - rPadX, rTop + rLen);
  // Bottom-left
  ctx.moveTo(rPadX, rBot - rLen);
  ctx.lineTo(rPadX, rBot);
  ctx.lineTo(rPadX + rLen, rBot);
  // Bottom-right
  ctx.moveTo(W - rPadX - rLen, rBot);
  ctx.lineTo(W - rPadX, rBot);
  ctx.lineTo(W - rPadX, rBot - rLen);
  ctx.stroke();

  // Export JPEG at 0.82 quality (step down if ever >= 28 KB)
  let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  if (estimateDataUrlBytes(dataUrl) >= 28_000) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  }

  cachedReconDataUrl = dataUrl;
  return dataUrl;
}
