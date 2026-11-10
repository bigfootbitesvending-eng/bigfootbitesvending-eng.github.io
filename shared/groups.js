/* ============================================================
   Bigfoot Bites: a list grouped under headings, everything by name.
   Load it before the page's own script.

     BBGroups.byName(list, headingOf, nameOf)
       -> [{ key: 'Drinks', items: [...] }, { key: 'Other', items: [...] }]

   Headings sort by name. A blank heading becomes "Other", after
   every named one. Items sort by name inside each heading.
   Where to Buy and the Price Check List group by catalog category.
   ============================================================ */
(function () {
  function byName(list, headingOf, nameOf) {
    var groups = {};
    (list || []).forEach(function (x) {
      var h = headingOf(x);
      var key = String(h == null ? '' : h).trim() || 'Other';
      (groups[key] = groups[key] || []).push(x);
    });
    return Object.keys(groups).sort(function (a, b) {
      return (a === 'Other') - (b === 'Other') || a.localeCompare(b);
    }).map(function (key) {
      return { key: key, items: groups[key].sort(function (a, b) { return String(nameOf(a)).localeCompare(String(nameOf(b))); }) };
    });
  }
  window.BBGroups = { byName: byName };
})();
