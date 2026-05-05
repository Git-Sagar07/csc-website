/**
 * CSC CENTER WEBSITE — main.js
 * Handles: config, WhatsApp CTA, scroll reveal, contact form, notices API
 */

/* ══════════════════════════════════════════
   SITE CONFIG — edit before deploying
══════════════════════════════════════════ */
const CSC_CONFIG = {
  ownerName:       "समर्थ कापसे",           // Marathi name
  ownerNameEn:     "Samarth Kapse",
  centerName:      "शिवकृपा कॉम्प्युटर & मल्टीसर्विसेस CSC सेवा केंद्र",  // Center name
  centerNameEn:    "Shivkrupa Computer & Multiservices",
  vleId:           "VLE/MH/2019/0483721",
  phone:           "+91 98765 43210",
  whatsapp:        "919876543210",            // No + or spaces
  email:           "shivkrupacsc@gmail.com",
  address:         "बालाजी मेडिकल शेजारी, आंबेडकर चौक, पाथर्डी रोड, ता. शेवगाव, जि. अहिल्यानगर - 414502 ",
  addressEn:       "Near Balaji Medical, Ambedkar chauk, Pathardi road, Tal. Shevgaon, Dist. Ahilyanagar - 414502 (Maharashtra, India)",
  district:        "अहिल्यानगर जिल्हा",
  workingHours:    "सोमवार - शनिवार: सकाळी ९:०० - संध्या. ७:०○",
  workingHoursEn:  "Mon–Sat: 9:00 AM – 7:00 PM",
  mapsEmbed:       "https://maps.google.com/maps?q=Shevgaon,Ahilyanagar&output=embed",
  apiBase:         "http://localhost:3000/api",   // Change to prod URL
  yearEst:         2019,
};

/* ══════════════════════════════════════════
   DOM READY
══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  injectConfig();
  initScrollReveal();
  initWhatsApp();
  initBottomNav();
  initContactForm();
  loadNotices();
  initFilterBtns();
  initChecklist();
  initGallery();
});

/* ══════════════════════════════════════════
   INJECT DYNAMIC CONFIG INTO DOM
══════════════════════════════════════════ */
function injectConfig() {
  document.querySelectorAll("[data-cfg]").forEach(el => {
    const key = el.dataset.cfg;
    if (CSC_CONFIG[key] !== undefined) el.textContent = CSC_CONFIG[key];
  });
  // WhatsApp hrefs
  const waMsg = encodeURIComponent(`नमस्कार, मला CSC सेवेबद्दल माहिती हवी आहे.`);
  document.querySelectorAll("[data-wa]").forEach(el => {
    el.href = `https://wa.me/${CSC_CONFIG.whatsapp}?text=${waMsg}`;
  });
  // Phone hrefs
  document.querySelectorAll("[data-phone]").forEach(el => {
    el.href = `tel:${CSC_CONFIG.phone}`;
  });
}

/* ══════════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════════ */
function initScrollReveal() {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } }),
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════
   WHATSAPP FLOATING BUTTON
══════════════════════════════════════════ */
function initWhatsApp() {
  // Show tooltip briefly on load
  const tooltip = document.querySelector(".wa-tooltip");
  if (!tooltip) return;
  setTimeout(() => { tooltip.style.display = "block"; }, 2500);
  setTimeout(() => { tooltip.style.display = "none"; }, 6000);
}

/* ══════════════════════════════════════════
   BOTTOM NAV ACTIVE STATE
══════════════════════════════════════════ */
function initBottomNav() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".bottom-nav a, .nav-links a").forEach(a => {
    const href = a.getAttribute("href");
    if (href && (href === page || (page === "index.html" && href === "index.html") || (page === "" && href === "index.html"))) {
      a.classList.add("active");
    }
  });
}

/* ══════════════════════════════════════════
   CONTACT FORM
══════════════════════════════════════════ */
function initContactForm() {
  const form = document.getElementById("contactForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("[type=submit]");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    const data = {
      name:    form.name.value.trim(),
      phone:   form.phone.value.trim(),
      service: form.service.value,
      message: form.message.value.trim(),
    };

    try {
      const res = await fetch(`${CSC_CONFIG.apiBase}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        showAlert(form, "success", "✅ संदेश पाठवला! आम्ही लवकरच संपर्क करू.");
        form.reset();
      } else {
        throw new Error(json.message || "Error");
      }
    } catch (err) {
      // Fallback: open WhatsApp
      const msg = encodeURIComponent(`नमस्कार!\nनाव: ${data.name}\nफोन: ${data.phone}\nसेवा: ${data.service}\nसंदेश: ${data.message}`);
      showAlert(form, "info", `⚠️ Server error. <a href="https://wa.me/${CSC_CONFIG.whatsapp}?text=${msg}" target="_blank" style="color:#003087;font-weight:700">WhatsApp वर संपर्क करा →</a>`);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });
}

function showAlert(parent, type, html) {
  let el = parent.querySelector(".form-alert");
  if (!el) {
    el = document.createElement("div");
    el.className = "form-alert";
    parent.appendChild(el);
  }
  el.className = `form-alert form-${type === "success" ? "success" : "error"}`;
  el.innerHTML = html;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setTimeout(() => el.remove(), 8000);
}

/* ══════════════════════════════════════════
   LOAD NOTICES FROM API (with fallback)
══════════════════════════════════════════ */
const FALLBACK_NOTICES = [
  { id: 1, type: "urgent", title: "PM Kisan Samman Nidhi - नोंदणी सुरू", title_mr: "PM किसान सन्मान निधी - नोंदणी सुरू आहे", body: "Last date: 31 May 2025", date: "2025-05-01" },
  { id: 2, type: "new",    title: "Aadhaar Update Camp - निःशुल्क", title_mr: "आधार अपडेट शिबीर - पूर्णपणे विनामूल्य", body: "10 May 2025 - 9 AM to 5 PM", date: "2025-05-01" },
  { id: 3, type: "normal", title: "Scholarship Forms Open", title_mr: "शिष्यवृत्ती अर्ज सुरू - MAHADBT Portal", body: "Apply before 15 May 2025", date: "2025-05-01" },
  { id: 4, type: "normal", title: "CSC Center Closed - Holi", title_mr: "रंगपंचमी निमित्त केंद्र बंद राहील", body: "Date: 24 March 2025", date: "2025-04-20" },
];

async function loadNotices() {
  const container = document.getElementById("noticesContainer");
  if (!container) return;
  try {
    const res = await fetch(`${CSC_CONFIG.apiBase}/notices?limit=6`);
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    renderNotices(container, data);
  } catch {
    renderNotices(container, FALLBACK_NOTICES);
  }
}

function renderNotices(container, notices) {
  container.innerHTML = notices.map(n => `
    <div class="notice-item ${n.type}" data-id="${n.id}">
      <div class="notice-dot"></div>
      <div class="notice-content">
        <h4>${n.title_mr || n.title}</h4>
        <p>${n.body}</p>
        <span class="notice-date">📅 ${formatDate(n.date)}</span>
      </div>
      ${n.type === "urgent" ? `<span class="tag tag-saffron">जरुरी</span>` : ""}
      ${n.type === "new"    ? `<span class="tag tag-green">नवीन</span>`  : ""}
    </div>
  `).join("");
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("mr-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ══════════════════════════════════════════
   SERVICE FILTER BUTTONS
══════════════════════════════════════════ */
function initFilterBtns() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const cat = btn.dataset.cat;
      document.querySelectorAll(".service-card").forEach(card => {
        card.parentElement.style.display =
          (cat === "all" || card.dataset.cat === cat) ? "" : "none";
      });
    });
  });
}

/* ══════════════════════════════════════════
   DOCUMENT CHECKLIST MODAL
══════════════════════════════════════════ */
const CHECKLISTS = {
  aadhaar: {
    title: "आधार अपडेट - लागणारी कागदपत्रे",
    docs: ["जुने आधार कार्ड", "मोबाईल नंबर (OTP साठी)", "जन्म प्रमाणपत्र (वय बदल असल्यास)", "पत्त्याचा पुरावा (पत्ता बदल असल्यास)"],
  },
  pan: {
    title: "PAN Card - आवश्यक कागदपत्रे",
    docs: ["आधार कार्ड", "फोटो (पासपोर्ट साईझ - 2)", "जन्म प्रमाणपत्र", "सहीचा नमुना"],
  },
  passport: {
    title: "Passport - आवश्यक कागदपत्रे",
    docs: ["आधार कार्ड", "PAN कार्ड", "जन्म प्रमाणपत्र", "10वी/12वी मार्कशीट", "पत्त्याचा पुरावा", "फोटो (पांढरा बॅकग्राउंड, 4 फोटो)"],
  },
  voter: {
    title: "Voter ID - आवश्यक कागदपत्रे",
    docs: ["आधार कार्ड", "वयाचा पुरावा (जन्म प्रमाणपत्र)", "रहिवासाचा पुरावा", "पासपोर्ट साईझ फोटो"],
  },
  pmkisan: {
    title: "PM-KISAN नोंदणी - कागदपत्रे",
    docs: ["आधार कार्ड", "बँक पासबुक (खाते क्रमांक)", "जमीन 7/12 उतारा", "मोबाईल नंबर"],
  },
};

function initChecklist() {
  document.querySelectorAll("[data-checklist]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.checklist;
      const data = CHECKLISTS[key];
      if (!data) return;
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-box">
          <div class="modal-header">
            <h3>${data.title}</h3>
            <button class="modal-close" aria-label="Close">✕</button>
          </div>
          <div class="checklist">
            ${data.docs.map(d => `<div class="checklist-item">${d}</div>`).join("")}
          </div>
          <div style="margin-top:18px">
            <a href="https://wa.me/${CSC_CONFIG.whatsapp}?text=${encodeURIComponent("मला " + data.title + " साठी अपॉइंटमेंट घ्यायची आहे.")}"
               class="btn btn-whatsapp btn-block" target="_blank">
              📲 WhatsApp वर बुकिंग करा
            </a>
          </div>
        </div>`;
      overlay.querySelector(".modal-close").onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
    });
  });
}

/* ══════════════════════════════════════════
   GALLERY LIGHTBOX
══════════════════════════════════════════ */
function initGallery() {
  document.querySelectorAll(".gallery-item[data-src]").forEach(item => {
    item.addEventListener("click", () => {
      const lb = document.createElement("div");
      lb.className = "lightbox";
      lb.innerHTML = `
        <button class="lightbox-close">✕</button>
        <img src="${item.dataset.src}" alt="Gallery photo">`;
      lb.querySelector(".lightbox-close").onclick = () => lb.remove();
      lb.onclick = (e) => { if (e.target === lb) lb.remove(); };
      document.body.appendChild(lb);
    });
  });
}

/* ══════════════════════════════════════════
   YEAR COUNTER (for "Est. since")
══════════════════════════════════════════ */
(function setYears() {
  const el = document.getElementById("yearsActive");
  if (el) el.textContent = new Date().getFullYear() - CSC_CONFIG.yearEst;
})();
