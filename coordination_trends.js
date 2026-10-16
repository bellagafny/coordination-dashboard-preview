/*
 * מגמות תאום -- pure display-side helpers (no DOM, no fetch).
 *
 * All numbers come as-is from the coordinationTrends block (schemaVersion 2)
 * of dashboard_data.json, computed and reconciled in Python
 * (app/coordination_trends.py, validator.run_trend_validation). This file
 * only decides whether the block may be shown and maps it to labels.
 *
 * blockStatus() shows a block ONLY if it is PASSED and belongs to this exact
 * refresh: refreshId, dataAsOf and sourceFile equal metadata's, and
 * schemaVersion is supported. Anything else -> "not available"; a previous
 * run's block is never shown as current, even when dataAsOf did not change.
 */
(function (root) {
  'use strict';

  var SUPPORTED_SCHEMA_VERSION = 2;
  var DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function parseDMY(s) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || ''));
    return m ? { d: +m[1], m: +m[2], y: +m[3] } : null;
  }

  function dayName(s) {
    var p = parseDMY(s);
    return p ? DAY_NAMES[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : '';
  }

  function ddmm(s) { return String(s || '').slice(0, 5); }
  function mmyyyy(s) { return String(s || '').slice(3, 10); }

  // business-time days with 2 decimals; null -> '—'
  function fmtDays(x) {
    return (x === null || x === undefined) ? '—' : Number(x).toFixed(2);
  }

  function fmtPct(x) {
    return (x === null || x === undefined) ? '—' : (Math.round(x * 1000) / 10).toFixed(1) + '%';
  }

  // ---------- "היום" heading (explicit Asia/Jerusalem) ----------

  function israelTodayDMY(now) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(now);
    } catch (e) {
      return null; // never claim "היום" if the Israel date cannot be determined
    }
  }

  function todayHeading(todayDate, dataAsOf, now) {
    var israelToday = israelTodayDMY(now || new Date());
    if (todayDate && israelToday && israelToday === todayDate) {
      var asOf = String(dataAsOf || '');
      var time = asOf.indexOf(todayDate) === 0 ? asOf.slice(11, 16) : '';
      return /^\d{2}:\d{2}$/.test(time) ? 'היום (עד ' + time + ')' : 'היום';
    }
    return 'נתוני יום ' + (todayDate || '—') + ' (יום הנתונים האחרון)';
  }

  // ---------- block freshness / status ----------

  function blockStatus(data) {
    var meta = (data && data.metadata) || {};
    var b = data && data.coordinationTrends;
    if (!b) return { ok: false, reason: 'הבלוק coordinationTrends חסר בקובץ הנתונים.' };
    if (b.schemaVersion !== SUPPORTED_SCHEMA_VERSION)
      return { ok: false, reason: 'גרסת מבנה לא נתמכת (' + b.schemaVersion + ').' };
    if (!meta.refreshId || b.refreshId !== meta.refreshId)
      return { ok: false, reason: 'הבלוק אינו שייך לרענון הנוכחי (מזהה רענון שונה).' };
    if (b.dataAsOf !== meta.dataAsOf || b.sourceFile !== meta.sourceFile)
      return { ok: false, reason: 'הבלוק אינו תואם לתאריך הנתונים או לקובץ המקור של הרענון הנוכחי.' };
    if (b.status !== 'PASSED')
      return { ok: false, reason: 'בקרות המגמות לא עברו ברענון זה' + (b.error ? ' (' + b.error + ')' : '') + '.' };
    if (!b.monthly || !b.daily || !b.today || !b.settings)
      return { ok: false, reason: 'נתוני המגמות חסרים בבלוק.' };
    return { ok: true, reason: '' };
  }

  // ---------- view mapping ----------

  function monthlyRows(block) {
    var s = block.settings || {};
    return (block.monthly || []).map(function (r) {
      var label = mmyyyy(r.month);
      var marks = [];
      if (r.rampUp) marks.push('חודש הרצה');
      if (r.processChange) marks.push('שינוי תהליך ' + ddmm(s.processChangeDate));
      if (r.partialThrough) marks.push('חלקי, עד ' + ddmm(r.partialThrough));
      var c = r.cohort;
      var openShare = c.size ? c.notCoordinated / c.size : 0;
      var since = c.businessDaysSinceMonthEnd + ' ימי עבודה מסוף החודש';
      var byShare = 'עברו ' + s.maturityBusinessDays + ' ימי עבודה ו־' + fmtPct(openShare) + ' טרם תואמו (עד ' +
        fmtPct(s.maturityMaxOpenShare) + ')';
      var byTime = 'עברו ' + s.maturityBusinessDaysAny + ' ימי עבודה';
      var maturity = {
        openShare: 'בשל — ' + byShare + ' · ' + since,
        time: 'בשל — ' + byTime + ' (ללא תלות בשיעור שטרם תואמו; ' + fmtPct(openShare) + ' טרם תואמו) · ' + since,
        both: 'בשל — שני התנאים: ' + byShare + '; וגם ' + byTime + ' · ' + since
      }[c.maturityRule] || ('לא בשל — ' + since + ' (נדרשים ' + s.maturityBusinessDays + ' ועד ' +
        fmtPct(s.maturityMaxOpenShare) + ' שטרם תואמו, או ' + s.maturityBusinessDaysAny + '); ' + fmtPct(openShare) + ' טרם תואמו');
      var coordinatedTotal = r.sla.onTime + r.sla.late;
      return Object.assign({}, r, {
        label: label,
        displayLabel: label + (marks.length ? ' (' + marks.join('; ') + ')' : ''),
        chartLabel: label + (r.rampUp ? ' · הרצה' : '') + (r.processChange ? ' · שינוי ' + ddmm(s.processChangeDate) : '') +
          (r.partialThrough ? ' · חלקי' : ''),
        maturityText: maturity,
        onTimeShare: coordinatedTotal ? r.sla.onTime / coordinatedTotal : null
      });
    });
  }

  function dailyRows(block) {
    var d = block.daily || { rows: [] };
    var rows = (d.rows || []).map(function (r) {
      var rolled = (r.rolledFrom || []).map(function (x) { return dayName(x) + ' ' + ddmm(x); });
      var out = Object.assign({}, r, { rolledLabels: rolled });
      if (r.kind === 'business') {
        var star = rolled.length ? '*' : '';
        out.chartLabel = ddmm(r.date) + star;
        out.displayLabel = ddmm(r.date) + star + ' (' + dayName(r.date) + ')';
        out.note = rolled.length ? 'כולל גם: ' + rolled.join(', ') : '';
      } else {
        var range = (r.dates || []).map(ddmm).join(', ');
        out.chartLabel = range;
        out.displayLabel = range;
        out.note = r.kind === 'monthEndNonBusiness'
          ? 'סוף חודש — ימים שאינם ימי עבודה (' + rolled.join(', ') + '); נשארים בחודש זה'
          : 'ימים שאינם ימי עבודה (' + rolled.join(', ') + ') — יצורפו ליום העבודה הבא כשיתקבלו נתוניו';
      }
      return out;
    });
    return { monthLabel: mmyyyy(d.month), lastDataDay: d.lastDataDay, rows: rows };
  }

  var api = {
    SUPPORTED_SCHEMA_VERSION: SUPPORTED_SCHEMA_VERSION,
    parseDMY: parseDMY,
    fmtDays: fmtDays,
    fmtPct: fmtPct,
    israelTodayDMY: israelTodayDMY,
    todayHeading: todayHeading,
    blockStatus: blockStatus,
    monthlyRows: monthlyRows,
    dailyRows: dailyRows
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoordinationTrends = api;
})(typeof window !== 'undefined' ? window : this);
