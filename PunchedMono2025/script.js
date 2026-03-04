// script.js (FINAL: html-to-image + polygon mask + capturing mode)

const body = document.getElementById("main-body");
const editor = document.getElementById("editor");
const logoToggle = document.getElementById("logo-toggle");
const glyphScreen = document.getElementById("glyph-screen");
const glyphGridDefault = document.getElementById("glyph-grid-default");
const glyphGridAlt = document.getElementById("glyph-grid-alt");
const styleToggle = document.getElementById("style-toggle");
const sizeSlider = document.getElementById("size-slider");
const sizeValue = document.getElementById("size-value");
const saveBtn = document.getElementById("save-btn");
const cardGrid = document.querySelector(".card-grid");
const gridMeasureCanvas = document.createElement("canvas");
const gridMeasureCtx = gridMeasureCanvas.getContext("2d");

// NOTE: baseViewportWidth는 리사이즈시 바뀌어야 해서 let으로
let baseViewportWidth = window.innerWidth || 1440;

function pxToVw(px) {
  return `${(px / baseViewportWidth) * 100}vw`;
}

const excludedGlyphs = new Set([
  " ",
  "$",
  "~",
  "|",
  "^",
  "_",
  "`",
  "@",
  "<",
  "=",
  ">",
  "%",
  "&",
]);

const glyphChars = (() => {
  let chars = "";
  for (let i = 32; i <= 126; i += 1) chars += String.fromCharCode(i);
  return chars;
})();

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playPunchSound() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(100, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

// 바디 클릭 반전
body.addEventListener("click", (e) => {
  if (body.classList.contains("capturing")) return;
  if (e.target.closest("header") || e.target.closest("#glyph-screen")) return;
  if (e.target.id === "editor") return;
  body.classList.toggle("inverted");
});

// 스타일 토글
styleToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (body.classList.contains("capturing")) return;

  const current = getComputedStyle(body).getPropertyValue("--font-feature").trim();
  body.style.setProperty("--font-feature", current === '"ss01" 1' ? '"ss01" 0' : '"ss01" 1');
  syncStyleToggleLabel();
  updateGridToFont();
});

function syncStyleToggleLabel() {
  const current = getComputedStyle(body).getPropertyValue("--font-feature").trim();
  styleToggle.textContent = current === '"ss01" 1' ? "style01" : "style00";
}

function renderGlyphGrid(target, featureValue) {
  target.innerHTML = "";
  for (const ch of glyphChars) {
    if (excludedGlyphs.has(ch)) continue;
    const cell = document.createElement("div");
    cell.className = "glyph-cell";
    cell.style.fontFeatureSettings = featureValue;
    cell.textContent = ch;
    target.appendChild(cell);
  }
}

function toggleGlyphScreen(e) {
  e.stopPropagation();
  if (body.classList.contains("capturing")) return;

  const willOpen = !body.classList.contains("glyph-open");
  body.classList.toggle("glyph-open", willOpen);
  logoToggle.setAttribute("aria-expanded", String(willOpen));
  glyphScreen.setAttribute("aria-hidden", String(!willOpen));
}

logoToggle.addEventListener("click", toggleGlyphScreen);
logoToggle.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") toggleGlyphScreen(e);
});

// 사이즈 슬라이더
sizeSlider.addEventListener("input", (e) => {
  const size = Number(e.target.value);
  sizeValue.textContent = `${size}px`;

  body.style.setProperty("--font-size", pxToVw(size));
  body.style.setProperty("--glyph-size", pxToVw(Math.max(14, size * 0.24)));
  body.style.setProperty("--glyph-cell-size", pxToVw(Math.max(34, size * 0.52)));
  body.style.setProperty("--glyph-gap", pxToVw(Math.max(4, Math.round(size * 0.06))));

  updateGridToFont();
});

function measureFontCell(fontSize) {
  const features = getComputedStyle(body).getPropertyValue("--font-feature").trim();
  const weight = getComputedStyle(editor).fontWeight || "400";

  gridMeasureCtx.font = `${weight} ${fontSize}px "PunchedMono", monospace`;
  gridMeasureCtx.fontKerning = "none";

  const sample = "PUNCHEDMONO0123456789";
  const avgWidth = gridMeasureCtx.measureText(sample).width / sample.length;

  const metrics = gridMeasureCtx.measureText("Hg09");
  const rawHeight =
    (metrics.actualBoundingBoxAscent || fontSize * 0.78) +
    (metrics.actualBoundingBoxDescent || fontSize * 0.22);

  const styleAdjust = features.includes('"ss01" 1') ? 1.02 : 1;

  return {
    col: Math.max(8, avgWidth * styleAdjust),
    row: Math.max(10, rawHeight * 1.02),
  };
}

function updateGridToFont() {
  const fontSize = parseFloat(getComputedStyle(editor).fontSize) || 100;
  const cell = measureFontCell(fontSize);
  cardGrid.style.setProperty("--grid-col", pxToVw(Number(cell.col.toFixed(2))));
  cardGrid.style.setProperty("--grid-row", pxToVw(Number(cell.row.toFixed(2))));
}

// 타이핑 소리
editor.addEventListener("keydown", () => {
  if (audioCtx.state === "suspended") audioCtx.resume();
  playPunchSound();
});

// ✅ 폰트 로드 대기
async function waitForFonts() {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (_) {
    // ignore
  }
}

/**
 * polygon(...) 문자열에서 % 좌표를 0~1로 파싱
 */
function parsePolygonPoints(polygonStr) {
  if (!polygonStr) return null;

  const s = String(polygonStr).trim();
  if (!s.startsWith("polygon(") || !s.endsWith(")")) return null;

  const inner = s.slice("polygon(".length, -1).trim();
  const points = inner
    .split(",")
    .map((p) => p.trim())
    .map((p) => {
      const parts = p.split(/\s+/);
      if (parts.length < 2) return null;

      const xNum = parseFloat(parts[0]);
      const yNum = parseFloat(parts[1]);
      if (Number.isNaN(xNum) || Number.isNaN(yNum)) return null;

      return { x: xNum / 100, y: yNum / 100 };
    })
    .filter(Boolean);

  return points.length >= 3 ? points : null;
}

/**
 * 현재 카드의 polygon을 가져오기 (clip-path -> 변수 fallback)
 */
function getCardPolygonPoints(cardEl) {
  const cs = getComputedStyle(cardEl);

  const clip = cs.clipPath;
  let pts = parsePolygonPoints(clip);
  if (pts) return pts;

  const varPoly = cs.getPropertyValue("--card-outline-shape").trim();
  pts = parsePolygonPoints(varPoly);
  if (pts) return pts;

  return null;
}

/**
 * dataURL(PNG) -> Image -> Canvas 로 변환
 */
function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

/**
 * ✅ Canvas에 polygon 마스크 적용 (바깥 투명)
 */
function applyPolygonMaskToCanvas(srcCanvas, points01) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  const ctx = out.getContext("2d");

  // 원본 먼저
  ctx.drawImage(srcCanvas, 0, 0);

  // 마스크 영역만 남김
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.moveTo(points01[0].x * w, points01[0].y * h);
  for (let i = 1; i < points01.length; i += 1) {
    ctx.lineTo(points01[i].x * w, points01[i].y * h);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  return out;
}

/**
 * html-to-image로 만든 dataURL을 polygon shape로 컷
 */
async function maskPngDataUrlToPunchCard(dataUrl, points01) {
  if (!points01) return dataUrl;

  const img = await dataUrlToImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const masked = applyPolygonMaskToCanvas(canvas, points01);
  return masked.toDataURL("image/png");
}

// ✅ 이미지 저장 (style01 유지 + punch shape)
saveBtn.addEventListener("click", async (e) => {
  e.stopPropagation();

  const card = document.getElementById("punched-card");

  if (!card) {
    alert("저장할 영역(#punched-card)을 찾지 못했습니다.");
    return;
  }

  if (!window.htmlToImage || typeof window.htmlToImage.toPng !== "function") {
    alert(
      "저장 모듈(html-to-image)을 불러오지 못했습니다.\n" +
        "index.html에 html-to-image CDN을 script.js보다 위에 추가했는지 확인해 주세요."
    );
    return;
  }

  body.classList.add("capturing");

  try {
    await waitForFonts();
    updateGridToFont();

    // 현재 punch-card polygon 포인트 확보
    const points01 = getCardPolygonPoints(card);

    // 1) DOM을 PNG로 (font-feature 포함될 확률이 높음)
    const dataUrl = await window.htmlToImage.toPng(card, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: null, // 투명 유지
    });

    // 2) punch-card 모양으로 마스크 적용
    const maskedUrl = await maskPngDataUrlToPunchCard(dataUrl, points01);

    // 3) 다운로드
    const link = document.createElement("a");
    link.download = "punchedmono_blackwhite_card.png";
    link.href = maskedUrl;
    link.click();
  } catch (err) {
    console.error("SAVE IMAGE ERROR", err);
    alert(
      "이미지 저장 중 오류가 발생했습니다.\n" +
        "콘솔을 확인해 주세요."
    );
  } finally {
    body.classList.remove("capturing");
  }
});

// 초기 세팅
updateGridToFont();
syncStyleToggleLabel();
sizeValue.textContent = `${Number(sizeSlider.value)}px`;

body.style.setProperty("--glyph-size", pxToVw(Math.max(14, Number(sizeSlider.value) * 0.24)));
body.style.setProperty("--glyph-cell-size", pxToVw(Math.max(34, Number(sizeSlider.value) * 0.52)));
body.style.setProperty("--glyph-gap", pxToVw(Math.max(4, Math.round(Number(sizeSlider.value) * 0.06))));

renderGlyphGrid(glyphGridDefault, '"ss01" 0');
renderGlyphGrid(glyphGridAlt, '"ss01" 1');

// 리사이즈시 vw 기준 재계산
window.addEventListener("resize", () => {
  baseViewportWidth = window.innerWidth || 1440;
  updateGridToFont();
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(updateGridToFont);
}

editor.focus();