/**
 * ============================================================
 * CNDS Charts Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Lightweight SVG-based charts. Zero dependencies.
 * Supported types: bar, line, pie, doughnut, polarArea,
 *                  radar, bubble, scatter.
 * Mixed charts:    type="bar" with per-dataset type:"line" overrides.
 * Horizontal bars: type="bar" with indexAxis="y".
 *
 * Usage (declarative):
 *   <div data-cnds-chart-init data-cnds-type="bar"
 *        data-cnds-labels='["Jan","Feb","Mar"]'
 *        data-cnds-datasets='[{"label":"Sales","data":[10,20,30]}]'>
 *   </div>
 *
 * Usage (programmatic):
 *   new Nimbus.Chart(el, { type: 'bar', labels: [...], datasets: [...] });
 *
 * Legend items are clickable to toggle the corresponding dataset or slice.
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "chart";
  const EVENT_KEY = ".cnds." + NAME;

  const COLORS = [
    "#5ccc59",
    "#1976d2",
    "#00b74a",
    "#ff9800",
    "#9c27b0",
    "#00bcd4",
    "#e91e63",
    "#4caf50",
    "#ff5722",
    "#607d8b"
  ];

  const Default = {
    type: "bar",       // bar | line | pie | doughnut | polarArea | radar | bubble | scatter
    indexAxis: "x",    // "x" = vertical bars, "y" = horizontal bars
    xScale: "linear",  // "linear" | "log"
    labels: [],
    datasets: [],
    width: null,
    height: 300,
    showLegend: true,
    showTooltip: true,
    showGrid: true,
    title: null,
    padding: { top: 20, right: 20, bottom: 40, left: 50 },
    barWidth: 0.7,
    doughnutHole: 0.6,
    colors: null,
    animated: true,
    xAxisColor: null,
    yAxisColor: null,
    y2AxisColor: null,
    legendLabelColor: null
  };

  const DefaultType = {
    type: "string",
    indexAxis: "string",
    xScale: "string",
    labels: "array",
    datasets: "array",
    width: "(number|null)",
    height: "number",
    showLegend: "boolean",
    showTooltip: "boolean",
    showGrid: "boolean",
    title: "(string|null)",
    padding: "object",
    barWidth: "number",
    doughnutHole: "number",
    colors: "(array|null)",
    animated: "boolean",
    xAxisColor: "(string|null)",
    yAxisColor: "(string|null)",
    y2AxisColor: "(string|null)",
    legendLabelColor: "(string|null)"
  };

  class Chart extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);
      this._svg = null;
      this._tooltip = null;
      this._colors = this._config.colors || COLORS;
      this._init();
    }

    static get NAME() { return NAME; }
    static get Default() { return Default; }
    static get DefaultType() { return DefaultType; }

    // --- Public API ---

    update(data) {
      if (data.labels)   this._config.labels   = data.labels;
      if (data.datasets) this._config.datasets = data.datasets;
      this._render();
    }

    destroy() { this.dispose(); }

    dispose() {
      this._element.innerHTML = "";
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._element.classList.add("chart", "chart-" + this._config.type);

      if (this._config.labels.length === 0) {
        var labelsAttr = this._element.getAttribute("data-cnds-labels");
        if (labelsAttr) {
          try { this._config.labels = JSON.parse(labelsAttr); } catch (e) {}
        }
      }
      if (this._config.datasets.length === 0) {
        var dsAttr = this._element.getAttribute("data-cnds-datasets");
        if (dsAttr) {
          try { this._config.datasets = JSON.parse(dsAttr); } catch (e) {}
        }
      }

      this._render();
    }

    _render() {
      this._element.innerHTML = "";

      if (this._config.title) {
        var title = document.createElement("div");
        title.className = "chart-title";
        title.textContent = this._config.title;
        this._element.appendChild(title);
      }

      var width  = this._config.width || this._element.clientWidth || 400;
      var height = this._config.height;

      this._svg = this._createSVG(width, height);
      // Ensure the wrapper carries the base class so position/tooltip CSS applies
      this._element.classList.add("chart");
      // Tag the SVG with the chart-type class so type-specific CSS rules match
      // (hover, transition, grid selectors all scope on e.g. .chart-polarArea)
      var typeClass = this._config.type === "polar" ? "polarArea" : this._config.type;
      this._svg.setAttribute("class", "chart-" + typeClass);
      this._element.appendChild(this._svg);

      if (this._config.showTooltip) {
        this._tooltip = document.createElement("div");
        this._tooltip.className = "chart-tooltip";
        this._element.appendChild(this._tooltip);
      }

      switch (this._config.type) {
        case "bar":
          if (this._config.indexAxis === "y") {
            this._renderBarHorizontal(width, height);
          } else if (this._config.datasets.some(function (ds) { return ds.type === "line"; })) {
            this._renderMixed(width, height);
          } else {
            this._renderBar(width, height);
          }
          break;
        case "line":        this._renderLine(width, height);       break;
        case "pie":         this._renderPie(width, height);        break;
        case "doughnut":    this._renderDoughnut(width, height);   break;
        case "polar":
        case "polarArea":   this._renderPolar(width, height);      break;
        case "radar":       this._renderRadar(width, height);      break;
        case "bubble":      this._renderBubble(width, height);     break;
        case "scatter":     this._renderScatter(width, height);    break;
      }

      if (this._config.showLegend) {
        this._renderLegend();
      }
    }

    _createSVG(width, height) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.width  = "100%";
      svg.style.height = height + "px";
      return svg;
    }

    // ----------------------------------------------------------------
    // Bar (vertical)
    // ----------------------------------------------------------------
    _renderBar(width, height) {
      var p        = this._config.padding;
      var chartW   = width  - p.left - p.right;
      var chartH   = height - p.top  - p.bottom;
      var labels   = this._config.labels;
      var datasets = this._config.datasets;
      if (!labels.length || !datasets.length) return;

      var allValues = [];
      datasets.forEach(function (ds) { allValues = allValues.concat(ds.data); });
      var maxVal = Math.max.apply(null, allValues) * 1.1 || 1;

      var groupWidth = chartW / labels.length;
      var barW       = (groupWidth * this._config.barWidth) / datasets.length;
      var self       = this;

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var i = 0; i <= 5; i++) {
          var y = p.top + chartH - (chartH / 5) * i;
          gridG.appendChild(this._createLine(p.left, y, p.left + chartW, y));
        }
        this._svg.appendChild(gridG);
      }

      var axisG = this._createGroup("chart-axis");
      for (var j = 0; j <= 5; j++) {
        var yVal = (maxVal / 5) * j;
        var yPos = p.top + chartH - (chartH / 5) * j;
        var yTxt = this._createText(p.left - 8, yPos + 4, Math.round(yVal), "end");
        if (this._config.yAxisColor) yTxt.setAttribute("fill", this._config.yAxisColor);
        axisG.appendChild(yTxt);
      }
      labels.forEach(function (label, idx) {
        var x    = p.left + groupWidth * idx + groupWidth / 2;
        var xTxt = self._createText(x, height - p.bottom + 20, label, "middle");
        if (self._config.xAxisColor) xTxt.setAttribute("fill", self._config.xAxisColor);
        axisG.appendChild(xTxt);
      });
      this._svg.appendChild(axisG);

      this._barFloor  = p.top + chartH;
      this._barRects  = [];
      this._barGroups = [];

      datasets.forEach(function (ds, dsIdx) {
        var dsColor     = self._colors[dsIdx % self._colors.length];
        var hasBgArray  = Array.isArray(ds.backgroundColor);
        var hasBdArray  = Array.isArray(ds.borderColor);
        var borderWidth = ds.borderWidth || 0;
        var dsG         = document.createElementNS("http://www.w3.org/2000/svg", "g");
        var dsRects     = [];
        dsG.setAttribute("data-ds", dsIdx);
        labels.forEach(function (label, idx) {
          var val       = ds.data[idx] || 0;
          var barH      = (val / maxVal) * chartH;
          var x         = p.left + groupWidth * idx + (groupWidth - barW * datasets.length) / 2 + barW * dsIdx;
          var y         = p.top + chartH - barH;
          var fillColor = hasBgArray ? (ds.backgroundColor[idx] || dsColor) : dsColor;
          var bdColor   = hasBdArray ? (ds.borderColor[idx] || null) : null;

          var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x",      x);
          rect.setAttribute("y",      self._config.animated ? p.top + chartH : y);
          rect.setAttribute("width",  barW - 2);
          rect.setAttribute("height", self._config.animated ? 0 : barH);
          rect.setAttribute("fill",   fillColor);
          rect.setAttribute("rx",     "2");
          if (bdColor) {
            rect.setAttribute("stroke",       bdColor);
            rect.setAttribute("stroke-width", borderWidth || 1);
          }
          rect._barY  = y;
          rect._barH  = barH;
          rect._currH = barH;
          rect._currY = y;

          if (self._config.animated) {
            var animY = document.createElementNS("http://www.w3.org/2000/svg", "animate");
            animY.setAttribute("attributeName", "y");
            animY.setAttribute("from",          p.top + chartH);
            animY.setAttribute("to",            y);
            animY.setAttribute("dur",           "0.5s");
            animY.setAttribute("fill",          "freeze");
            rect.appendChild(animY);

            var animH = document.createElementNS("http://www.w3.org/2000/svg", "animate");
            animH.setAttribute("attributeName", "height");
            animH.setAttribute("from",          "0");
            animH.setAttribute("to",            barH);
            animH.setAttribute("dur",           "0.5s");
            animH.setAttribute("fill",          "freeze");
            rect.appendChild(animH);
          }

          if (self._config.showTooltip) {
            (function (el, lbl, v, c) {
              el.addEventListener("mouseenter", function () {
                self._showTooltip(el, { title: lbl, items: [{ color: c, text: ds.label + ": " + v }] });
              });
            })(rect, label, val, fillColor);
            rect.addEventListener("mouseleave", function () { self._hideTooltip(); });
          }

          dsRects.push(rect);
          dsG.appendChild(rect);
        });
        self._barRects[dsIdx]  = dsRects;
        self._barGroups[dsIdx] = dsG;
        self._svg.appendChild(dsG);
      });
    }

    // ----------------------------------------------------------------
    // Mixed — bar (default) + per-dataset type:"line" overlay.
    // Dual y-axis: set yAxisID:"right" on any dataset to plot it
    // against an independent right-side scale.
    // ----------------------------------------------------------------
    _renderMixed(width, height) {
      var p        = this._config.padding;
      var labels   = this._config.labels;
      var datasets = this._config.datasets;
      if (!labels.length || !datasets.length) return;

      var self     = this;
      var hasRight = datasets.some(function (ds) { return ds.yAxisID === "right"; });

      // Expand right padding when a right axis is present
      var rightPad = hasRight ? Math.max(p.right, 50) : p.right;
      var chartW   = width  - p.left - rightPad;
      var chartH   = height - p.top  - p.bottom;

      // Separate max values per axis (shared x-axis, independent y scales)
      var maxLeft = 0, maxRight = 0;
      datasets.forEach(function (ds) {
        (ds.data || []).forEach(function (v) {
          if (ds.yAxisID === "right") { if ((v || 0) > maxRight) maxRight = v; }
          else                        { if ((v || 0) > maxLeft)  maxLeft  = v; }
        });
      });
      maxLeft  = maxLeft  * 1.1 || 1;
      maxRight = maxRight * 1.1 || 1;

      function yPosForDS(ds, v) {
        var max = ds.yAxisID === "right" ? maxRight : maxLeft;
        return p.top + chartH - ((v || 0) / max) * chartH;
      }

      var groupWidth  = chartW / labels.length;
      var barDatasets = datasets.filter(function (ds) { return ds.type !== "line"; });
      var barW        = (groupWidth * this._config.barWidth) / Math.max(barDatasets.length, 1);

      // Grid — horizontal lines keyed to left axis
      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var i = 0; i <= 5; i++) {
          var gy = p.top + chartH - (chartH / 5) * i;
          gridG.appendChild(this._createLine(p.left, gy, p.left + chartW, gy));
        }
        this._svg.appendChild(gridG);
      }

      // Axis labels
      var axisG = this._createGroup("chart-axis");

      // Left y-axis (5 intervals)
      for (var j = 0; j <= 5; j++) {
        var lyVal = (maxLeft / 5) * j;
        var lyPos = p.top + chartH - (chartH / 5) * j;
        var lyTxt = this._createText(p.left - 8, lyPos + 4, Math.round(lyVal), "end");
        if (this._config.yAxisColor) lyTxt.setAttribute("fill", this._config.yAxisColor);
        axisG.appendChild(lyTxt);
      }

      // Right y-axis (5 intervals) — only when dual-axis is active
      if (hasRight) {
        for (var k = 0; k <= 5; k++) {
          var ryVal = (maxRight / 5) * k;
          var ryPos = p.top + chartH - (chartH / 5) * k;
          var ryTxt = this._createText(p.left + chartW + 8, ryPos + 4, Math.round(ryVal), "start");
          if (this._config.y2AxisColor) ryTxt.setAttribute("fill", this._config.y2AxisColor);
          axisG.appendChild(ryTxt);
        }
      }

      // X axis labels
      labels.forEach(function (label, idx) {
        var x    = p.left + groupWidth * idx + groupWidth / 2;
        var xTxt = self._createText(x, height - p.bottom + 20, label, "middle");
        if (self._config.xAxisColor) xTxt.setAttribute("fill", self._config.xAxisColor);
        axisG.appendChild(xTxt);
      });
      this._svg.appendChild(axisG);

      this._barFloor  = p.top + chartH;
      this._barRects  = [];
      this._barGroups = [];

      var barIdx = 0; // counts only non-line datasets for x positioning

      datasets.forEach(function (ds, dsIdx) {
        var paletteColor = self._colors[dsIdx % self._colors.length];

        if (ds.type === "line") {
          // ---- Line overlay ----
          var lineColor = ds.borderColor || ds.color || paletteColor;
          var lineWidth = ds.borderWidth || 2;
          var dotColor  = ds.pointBackgroundColor || ds.color || lineColor;
          var dsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          dsG.setAttribute("data-ds", dsIdx);

          var points = [];
          ds.data.forEach(function (val, idx) {
            var lx = p.left + groupWidth * idx + groupWidth / 2;
            var ly = yPosForDS(ds, val);
            points.push(lx + "," + ly);
          });

          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d",            "M" + points.join(" L"));
          path.setAttribute("stroke",       lineColor);
          path.setAttribute("fill",         "none");
          path.setAttribute("stroke-width", lineWidth);
          dsG.appendChild(path);

          ds.data.forEach(function (val, idx) {
            var cx     = p.left + groupWidth * idx + groupWidth / 2;
            var cy     = yPosForDS(ds, val);
            var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx",           cx);
            circle.setAttribute("cy",           cy);
            circle.setAttribute("r",            "4");
            circle.setAttribute("fill",         dotColor);
            circle.setAttribute("stroke",       "var(--cnds-chart-bg, #fff)");
            circle.setAttribute("stroke-width", "2");

            if (self._config.showTooltip) {
              (function (el, lbl, v, c) {
                el.addEventListener("mouseenter", function () {
                  self._showTooltip(el, { title: lbl, items: [{ color: c, text: ds.label + ": " + v }] });
                });
              })(circle, labels[idx], val, dotColor);
              circle.addEventListener("mouseleave", function () { self._hideTooltip(); });
            }
            dsG.appendChild(circle);
          });

          self._svg.appendChild(dsG);

        } else {
          // ---- Bar ----
          var hasBgArray  = Array.isArray(ds.backgroundColor);
          var hasBdArray  = Array.isArray(ds.borderColor);
          var borderWidth = ds.borderWidth || 0;
          var dsColor     = ds.color || paletteColor;
          var dsG         = document.createElementNS("http://www.w3.org/2000/svg", "g");
          var dsRects     = [];
          dsG.setAttribute("data-ds", dsIdx);

          var maxForDS      = ds.yAxisID === "right" ? maxRight : maxLeft;
          var currentBarIdx = barIdx;

          labels.forEach(function (label, idx) {
            var val       = ds.data[idx] || 0;
            var barH      = (val / maxForDS) * chartH;
            var bx        = p.left + groupWidth * idx + (groupWidth - barW * barDatasets.length) / 2 + barW * currentBarIdx;
            var by        = p.top + chartH - barH;
            var fillColor = hasBgArray ? (ds.backgroundColor[idx] || dsColor)
                                       : (ds.backgroundColor || dsColor);
            var bdColor   = hasBdArray ? (ds.borderColor[idx] || null)
                                       : (ds.borderColor     || null);

            var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x",      bx);
            rect.setAttribute("y",      self._config.animated ? p.top + chartH : by);
            rect.setAttribute("width",  barW - 2);
            rect.setAttribute("height", self._config.animated ? 0 : barH);
            rect.setAttribute("fill",   fillColor);
            rect.setAttribute("rx",     "2");
            if (bdColor) {
              rect.setAttribute("stroke",       bdColor);
              rect.setAttribute("stroke-width", borderWidth || 1);
            }
            rect._barY  = by;
            rect._barH  = barH;
            rect._currH = barH;
            rect._currY = by;

            if (self._config.animated) {
              var animY = document.createElementNS("http://www.w3.org/2000/svg", "animate");
              animY.setAttribute("attributeName", "y");
              animY.setAttribute("from",          p.top + chartH);
              animY.setAttribute("to",            by);
              animY.setAttribute("dur",           "0.5s");
              animY.setAttribute("fill",          "freeze");
              rect.appendChild(animY);

              var animH = document.createElementNS("http://www.w3.org/2000/svg", "animate");
              animH.setAttribute("attributeName", "height");
              animH.setAttribute("from",          "0");
              animH.setAttribute("to",            barH);
              animH.setAttribute("dur",           "0.5s");
              animH.setAttribute("fill",          "freeze");
              rect.appendChild(animH);
            }

            if (self._config.showTooltip) {
              (function (el, lbl, v, c) {
                el.addEventListener("mouseenter", function () {
                  self._showTooltip(el, { title: lbl, items: [{ color: c, text: ds.label + ": " + v }] });
                });
              })(rect, label, val, fillColor);
              rect.addEventListener("mouseleave", function () { self._hideTooltip(); });
            }

            dsRects.push(rect);
            dsG.appendChild(rect);
          });

          self._barRects[dsIdx]  = dsRects;
          self._barGroups[dsIdx] = dsG;
          self._svg.appendChild(dsG);
          barIdx++;
        }
      });
    }

    // ----------------------------------------------------------------
    // Bar (horizontal) — indexAxis: "y"
    // ----------------------------------------------------------------
    _renderBarHorizontal(width, height) {
      var p        = this._config.padding;
      var labelPad = 80;
      var chartW   = width  - labelPad - p.right;
      var chartH   = height - p.top   - p.bottom;
      var labels   = this._config.labels;
      var datasets = this._config.datasets;
      if (!labels.length || !datasets.length) return;

      var allValues = [];
      datasets.forEach(function (ds) { allValues = allValues.concat(ds.data); });
      var maxVal = Math.max.apply(null, allValues) * 1.1 || 1;

      var groupH = chartH / labels.length;
      var barH   = (groupH * this._config.barWidth) / datasets.length;
      var self   = this;

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var i = 0; i <= 5; i++) {
          var x = labelPad + (chartW / 5) * i;
          gridG.appendChild(this._createLine(x, p.top, x, p.top + chartH));
        }
        this._svg.appendChild(gridG);
      }

      var axisG = this._createGroup("chart-axis");
      for (var j = 0; j <= 5; j++) {
        var xVal = (maxVal / 5) * j;
        var xPos = labelPad + (chartW / 5) * j;
        axisG.appendChild(this._createText(xPos, p.top + chartH + 20, Math.round(xVal), "middle"));
      }
      labels.forEach(function (label, idx) {
        var y = p.top + groupH * idx + groupH / 2;
        axisG.appendChild(self._createText(labelPad - 8, y + 4, label, "end"));
      });
      this._svg.appendChild(axisG);

      this._horizAxisX  = labelPad;
      this._horizRects  = [];
      this._horizGroups = [];

      datasets.forEach(function (ds, dsIdx) {
        var color   = self._colors[dsIdx % self._colors.length];
        var dsG     = document.createElementNS("http://www.w3.org/2000/svg", "g");
        var dsRects = [];
        dsG.setAttribute("data-ds", dsIdx);
        labels.forEach(function (label, idx) {
          var val = ds.data[idx] || 0;
          var bW  = (val / maxVal) * chartW;
          var x   = labelPad;
          var y   = p.top + groupH * idx + (groupH - barH * datasets.length) / 2 + barH * dsIdx;

          var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x",      x);
          rect.setAttribute("y",      y);
          rect.setAttribute("width",  self._config.animated ? 0 : bW);
          rect.setAttribute("height", barH - 2);
          rect.setAttribute("fill",   color);
          rect.setAttribute("rx",     "2");
          rect._barW  = bW;
          rect._currW = bW;

          if (self._config.animated) {
            var anim = document.createElementNS("http://www.w3.org/2000/svg", "animate");
            anim.setAttribute("attributeName", "width");
            anim.setAttribute("from",          "0");
            anim.setAttribute("to",            bW);
            anim.setAttribute("dur",           "0.5s");
            anim.setAttribute("fill",          "freeze");
            rect.appendChild(anim);
          }

          if (self._config.showTooltip) {
            (function (el, lbl, v, c) {
              el.addEventListener("mouseenter", function () {
                self._showTooltip(el, { title: lbl, items: [{ color: c, text: ds.label + ": " + v }] });
              });
            })(rect, label, val, color);
            rect.addEventListener("mouseleave", function () { self._hideTooltip(); });
          }

          dsRects.push(rect);
          dsG.appendChild(rect);
        });
        self._horizRects[dsIdx]  = dsRects;
        self._horizGroups[dsIdx] = dsG;
        self._svg.appendChild(dsG);
      });
    }

    // ----------------------------------------------------------------
    // Line
    // ----------------------------------------------------------------
    _renderLine(width, height) {
      var p        = this._config.padding;
      var chartW   = width  - p.left - p.right;
      var chartH   = height - p.top  - p.bottom;
      var labels   = this._config.labels;
      var datasets = this._config.datasets;
      if (!labels.length || !datasets.length) return;

      var allValues = [];
      datasets.forEach(function (ds) { allValues = allValues.concat(ds.data); });
      var maxVal = Math.max.apply(null, allValues) * 1.1 || 1;
      var self   = this;

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var i = 0; i <= 5; i++) {
          var y = p.top + chartH - (chartH / 5) * i;
          gridG.appendChild(this._createLine(p.left, y, p.left + chartW, y));
        }
        this._svg.appendChild(gridG);
      }

      var axisG = this._createGroup("chart-axis");
      for (var j = 0; j <= 5; j++) {
        var yVal = (maxVal / 5) * j;
        var yPos = p.top + chartH - (chartH / 5) * j;
        axisG.appendChild(this._createText(p.left - 8, yPos + 4, Math.round(yVal), "end"));
      }
      labels.forEach(function (label, idx) {
        var x = p.left + (chartW / (labels.length - 1 || 1)) * idx;
        axisG.appendChild(self._createText(x, height - p.bottom + 20, label, "middle"));
      });
      this._svg.appendChild(axisG);

      datasets.forEach(function (ds, dsIdx) {
        var color  = self._colors[dsIdx % self._colors.length];
        var dsG    = document.createElementNS("http://www.w3.org/2000/svg", "g");
        dsG.setAttribute("data-ds", dsIdx);
        var points = [];
        ds.data.forEach(function (val, idx) {
          var x = p.left + (chartW / (labels.length - 1 || 1)) * idx;
          var y = p.top + chartH - ((val || 0) / maxVal) * chartH;
          points.push(x + "," + y);
        });

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d",            "M" + points.join(" L"));
        path.setAttribute("stroke",       color);
        path.setAttribute("fill",         "none");
        path.setAttribute("stroke-width", "2");
        dsG.appendChild(path);

        ds.data.forEach(function (val, idx) {
          var x      = p.left + (chartW / (labels.length - 1 || 1)) * idx;
          var y      = p.top + chartH - ((val || 0) / maxVal) * chartH;
          var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx",           x);
          circle.setAttribute("cy",           y);
          circle.setAttribute("r",            "4");
          circle.setAttribute("fill",         color);
          circle.setAttribute("stroke",       "#fff");
          circle.setAttribute("stroke-width", "2");

          if (self._config.showTooltip) {
            (function (el, lbl, v, c) {
              el.addEventListener("mouseenter", function () {
                self._showTooltip(el, { title: lbl, items: [{ color: c, text: ds.label + ": " + v }] });
              });
            })(circle, labels[idx], val, color);
            circle.addEventListener("mouseleave", function () { self._hideTooltip(); });
          }
          dsG.appendChild(circle);
        });
        self._svg.appendChild(dsG);
      });
    }

    // ----------------------------------------------------------------
    // Pie / Doughnut
    // ----------------------------------------------------------------
    _renderPie(width, height)     { this._renderPieOrDoughnut(width, height, 0); }
    _renderDoughnut(width, height){ this._renderPieOrDoughnut(width, height, this._config.doughnutHole); }

    _renderPieOrDoughnut(width, height, holeRatio) {
      var datasets = this._config.datasets;
      var labels   = this._config.labels;
      if (!datasets.length || !datasets[0].data) return;

      var data  = datasets[0].data;
      var total = data.reduce(function (a, b) { return a + b; }, 0);
      if (total === 0) return;

      var cx          = width  / 2;
      var cy          = height / 2;
      var radius      = Math.min(cx, cy) - 10;
      var innerRadius = radius * holeRatio;
      var self        = this;
      var startAngle  = -Math.PI / 2;

      this._pieData        = data.slice();
      this._piePaths       = [];
      this._pieHidden      = new Set();
      this._pieAnimRaf     = null;
      this._pieHoleRatio   = holeRatio;
      this._pieCX          = cx;
      this._pieCY          = cy;
      this._pieRadius      = radius;
      this._pieInnerRadius = innerRadius;

      data.forEach(function (val, idx) {
        var sliceAngle = (val / total) * Math.PI * 2;
        var color      = self._colors[idx % self._colors.length];

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill",       color);
        path.setAttribute("data-slice", idx);
        path._currentSA    = startAngle;
        path._currentAngle = sliceAngle;
        self._setPiePath(path, startAngle, sliceAngle);

        if (self._config.showTooltip) {
          var label = labels[idx] || "Item " + (idx + 1);
          var pct   = Math.round((val / total) * 100);
          (function (lbl, v, p, c) {
            path.addEventListener("mouseenter", function (e) {
              self._showTooltip(e, { title: lbl, items: [{ color: c, text: v + " (" + p + "%)" }] });
            });
            path.addEventListener("mousemove", function (e) { self._moveTooltip(e); });
          })(label, val, pct, color);
          path.addEventListener("mouseleave", function () { self._hideTooltip(); });
        }

        self._svg.appendChild(path);
        self._piePaths.push(path);
        startAngle += sliceAngle;
      });
    }

    // Compute and set the SVG path `d` for a pie/doughnut slice.
    _setPiePath(path, sa, sliceAngle) {
      var cx          = this._pieCX;
      var cy          = this._pieCY;
      var radius      = this._pieRadius;
      var innerRadius = this._pieInnerRadius;
      var holeRatio   = this._pieHoleRatio;
      // Near-zero → empty path: eliminates the thin-line artifact from a degenerate
      // wedge whose Z-close traces a visible radius line across the doughnut hole.
      // Near-full-circle → cap below 2π: an SVG arc where start === end is dropped
      // by the browser, making the last remaining slice disappear entirely.
      var angle = Math.max(0, Math.min(sliceAngle, Math.PI * 2 - 0.0001));
      if (angle < 0.001) {
        path.setAttribute("d", "M 0,0");
        return;
      }

      var endAngle = sa + angle;
      var x1       = cx + radius * Math.cos(sa);
      var y1       = cy + radius * Math.sin(sa);
      var x2       = cx + radius * Math.cos(endAngle);
      var y2       = cy + radius * Math.sin(endAngle);
      var largeArc = angle > Math.PI ? 1 : 0;
      var d;

      if (holeRatio > 0) {
        var ix1 = cx + innerRadius * Math.cos(sa);
        var iy1 = cy + innerRadius * Math.sin(sa);
        var ix2 = cx + innerRadius * Math.cos(endAngle);
        var iy2 = cy + innerRadius * Math.sin(endAngle);
        d = "M" + x1  + "," + y1  +
            " A" + radius      + "," + radius      + " 0 " + largeArc + ",1 " + x2  + "," + y2  +
            " L" + ix2 + "," + iy2 +
            " A" + innerRadius + "," + innerRadius + " 0 " + largeArc + ",0 " + ix1 + "," + iy1 + " Z";
      } else {
        d = "M" + cx + "," + cy +
            " L" + x1 + "," + y1 +
            " A" + radius + "," + radius + " 0 " + largeArc + ",1 " + x2 + "," + y2 + " Z";
      }
      path.setAttribute("d", d);
    }

    // Animate startAngle and sliceAngle simultaneously over duration ms.
    _animatePieSlice(path, fromSA, toSA, fromAngle, toAngle, duration) {
      var self  = this;
      var start = null;
      if (path._animRaf) cancelAnimationFrame(path._animRaf);

      function tick(ts) {
        if (!start) start = ts;
        var t     = Math.min((ts - start) / duration, 1);
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var sa    = fromSA    + (toSA    - fromSA)    * eased;
        var angle = fromAngle + (toAngle - fromAngle) * eased;
        path._currentSA    = sa;
        path._currentAngle = angle;
        self._setPiePath(path, sa, angle);
        if (t < 1) {
          path._animRaf = requestAnimationFrame(tick);
        } else {
          path._animRaf = null;
        }
      }
      path._animRaf = requestAnimationFrame(tick);
    }

    // Redistribute visible slices to fill 360° and animate the transition.
    // Single unified rAF loop — lerps both angle and midpoint for every slice simultaneously.
    // Lerping midpoints (not start angles) means each slice grows/shrinks from its own
    // centerline, and contiguity is preserved throughout (no white gaps).
    _updatePieChart(duration) {
      var self   = this;
      var data   = this._pieData;
      var paths  = this._piePaths;
      var hidden = this._pieHidden;
      var n      = paths.length;

      // Cancel any running animation (unified or legacy per-slice)
      if (this._pieAnimRaf) { cancelAnimationFrame(this._pieAnimRaf); this._pieAnimRaf = null; }
      paths.forEach(function (p) { if (p._animRaf) { cancelAnimationFrame(p._animRaf); p._animRaf = null; } });

      // Target angles
      var visTotal = 0;
      data.forEach(function (v, i) { if (!hidden.has(i)) visTotal += v; });
      if (visTotal === 0) visTotal = 1;

      var toAngles = paths.map(function (_, i) {
        return hidden.has(i) ? 0 : (data[i] / visTotal) * Math.PI * 2;
      });

      // Target midpoints — sequential layout from -π/2
      var toMids = (function () {
        var sa = -Math.PI / 2;
        return toAngles.map(function (a) { var mid = sa + a / 2; sa += a; return mid; });
      })();

      // From-state snapshot (current mid-animation positions)
      var fromAngles = paths.map(function (p) { return p._currentAngle; });
      var fromMids   = paths.map(function (p) { return p._currentSA + p._currentAngle / 2; });

      paths.forEach(function (p, i) { p.style.pointerEvents = hidden.has(i) ? "none" : ""; });

      var start = null;
      function tick(ts) {
        if (!start) start = ts;
        var t = Math.min((ts - start) / duration, 1);
        var f = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        for (var i = 0; i < n; i++) {
          var angle = fromAngles[i] + (toAngles[i] - fromAngles[i]) * f;
          var mid   = fromMids[i]   + (toMids[i]   - fromMids[i])   * f;
          var sa    = mid - angle / 2;
          paths[i]._currentSA    = sa;
          paths[i]._currentAngle = angle;
          self._setPiePath(paths[i], sa, angle);
        }
        self._pieAnimRaf = t < 1 ? requestAnimationFrame(tick) : null;
      }
      self._pieAnimRaf = requestAnimationFrame(tick);
    }

    // ----------------------------------------------------------------
    // Polar Area
    // ----------------------------------------------------------------
    _renderPolar(width, height) {
      var datasets = this._config.datasets;
      var labels   = this._config.labels;
      if (!datasets.length || !datasets[0].data) return;

      var data        = datasets[0].data;
      var maxVal      = Math.max.apply(null, data) || 1;
      var n           = data.length;
      var cx          = width  / 2;
      var cy          = height / 2;
      var outerRadius = Math.min(cx, cy) - 16;
      var angleStep   = (Math.PI * 2) / n;
      var self        = this;

      // Instance state used by legend toggle + rescale
      this._polarData       = data.slice();
      this._polarPaths      = [];
      this._polarHidden     = new Set();
      this._polarOuterR     = outerRadius;
      this._polarRingLabels = [];

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var r = 1; r <= 5; r++) {
          var gr     = (outerRadius / 5) * r;
          var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx",           cx);
          circle.setAttribute("cy",           cy);
          circle.setAttribute("r",            gr);
          circle.setAttribute("fill",         "none");
          circle.setAttribute("stroke",       "#e9ecef");
          circle.setAttribute("stroke-width", "1");
          gridG.appendChild(circle);
          // Scale label at 12-o'clock of each ring; ref stored for live updates
          var ringVal = Math.round((maxVal / 5) * r);
          var valLbl  = self._createText(cx + 4, cy - gr + 11, ringVal.toLocaleString(), "start");
          valLbl.setAttribute("font-size", "0.625rem");
          gridG.appendChild(valLbl);
          self._polarRingLabels.push(valLbl);
        }
        this._svg.appendChild(gridG);
      }

      data.forEach(function (val, idx) {
        var startAngle = angleStep * idx - Math.PI / 2;
        var radius     = (val / maxVal) * outerRadius;
        var color      = self._colors[idx % self._colors.length];

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill",         color);
        path.setAttribute("fill-opacity", "0.75");
        path.setAttribute("stroke",       "#fff");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("data-slice",   idx);
        path._polarCx      = cx;
        path._polarCy      = cy;
        path._currentR     = radius;      // live radius (updated every animation frame)
        path._currentSA    = startAngle;  // live start angle
        path._currentStep  = angleStep;   // live angular width
        self._setPolarPath(path, radius, startAngle, angleStep);

        if (self._config.showTooltip) {
          var label = labels[idx] || "Item " + (idx + 1);
          (function (lbl, v, c) {
            path.addEventListener("mouseenter", function (e) {
              self._showTooltip(e, { title: lbl, items: [{ color: c, text: v.toLocaleString() }] });
            });
            path.addEventListener("mousemove", function (e) { self._moveTooltip(e); });
          })(label, val, color);
          path.addEventListener("mouseleave", function () { self._hideTooltip(); });
        }

        self._svg.appendChild(path);
        self._polarPaths.push(path);
      });
    }

    // Recompute and set the SVG path `d` for a polar slice given explicit geometry.
    _setPolarPath(path, r, sa, step) {
      var cx      = path._polarCx;
      var cy      = path._polarCy;
      var radius  = Math.max(r, 0);
      var x1      = cx + radius * Math.cos(sa);
      var y1      = cy + radius * Math.sin(sa);
      var x2      = cx + radius * Math.cos(sa + step);
      var y2      = cy + radius * Math.sin(sa + step);
      var largeArc = step > Math.PI ? 1 : 0;
      path.setAttribute("d",
        "M" + cx + "," + cy +
        " L" + x1 + "," + y1 +
        " A" + radius + "," + radius + " 0 " + largeArc + ",1 " + x2 + "," + y2 + " Z"
      );
    }

    // Animate radius, start-angle, and step-width simultaneously over duration ms.
    // All three _current* properties are kept in sync so mid-animation restarts work.
    _animatePolarSlice(path, fromR, toR, fromSA, toSA, fromStep, toStep, duration) {
      var self  = this;
      var start = null;
      if (path._animRaf) cancelAnimationFrame(path._animRaf);

      function tick(ts) {
        if (!start) start = ts;
        var t     = Math.min((ts - start) / duration, 1);
        var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var r     = fromR    + (toR    - fromR)    * eased;
        var sa    = fromSA   + (toSA   - fromSA)   * eased;
        var step  = fromStep + (toStep - fromStep) * eased;
        path._currentR    = r;
        path._currentSA   = sa;
        path._currentStep = step;
        self._setPolarPath(path, r, sa, step);
        if (t < 1) {
          path._animRaf = requestAnimationFrame(tick);
        } else {
          path._animRaf = null;
        }
      }
      path._animRaf = requestAnimationFrame(tick);
    }

    // Recalculate and animate the full polar chart after a legend toggle.
    // Visible slices redistribute to fill all 360° and rescale to the new max.
    // Hidden slices collapse to radius 0 while visible slices rotate around them.
    _updatePolarChart(duration) {
      var self   = this;
      var data   = this._polarData;
      var paths  = this._polarPaths;
      var hidden = this._polarHidden;
      var outerR = this._polarOuterR;

      // New scale max from visible slices only
      var newMax = 0;
      data.forEach(function (v, i) { if (!hidden.has(i) && v > newMax) newMax = v; });
      if (newMax === 0) newMax = 1;

      // Distribute 360° evenly among visible slices (same as Chart.js polar area)
      var numVisible  = data.length - hidden.size;
      var newStep     = numVisible > 0 ? (2 * Math.PI / numVisible) : 0;
      var angleOffset = -Math.PI / 2; // start at 12 o'clock

      paths.forEach(function (path, i) {
        var toSA, toStep, toR;
        if (hidden.has(i)) {
          // Hidden: collapse radius to 0; angular position stays put (invisible anyway)
          toR    = 0;
          toSA   = path._currentSA;
          toStep = path._currentStep;
        } else {
          // Visible: claim the next slot in the redistributed circle
          toR    = (data[i] / newMax) * outerR;
          toSA   = angleOffset;
          toStep = newStep;
          angleOffset += newStep;
        }
        self._animatePolarSlice(
          path,
          path._currentR, toR,
          path._currentSA, toSA,
          path._currentStep, toStep,
          duration
        );
        path.style.pointerEvents = hidden.has(i) ? "none" : "";
      });

      // Update ring scale labels to reflect the new max
      self._polarRingLabels.forEach(function (lbl, i) {
        lbl.textContent = Math.round(newMax / 5 * (i + 1)).toLocaleString();
      });
    }

    // ----------------------------------------------------------------
    // Radar
    // ----------------------------------------------------------------
    _renderRadar(width, height) {
      var datasets = this._config.datasets;
      var labels   = this._config.labels;
      if (!labels.length || !datasets.length) return;

      var n           = labels.length;
      var cx          = width  / 2;
      var cy          = height / 2;
      var outerRadius = Math.min(cx, cy) - 36;
      var angleStep   = (Math.PI * 2) / n;
      var levels      = 5;
      var self        = this;

      var allValues = [];
      datasets.forEach(function (ds) { allValues = allValues.concat(ds.data); });
      var maxVal = Math.max.apply(null, allValues) || 1;

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var level = 1; level <= levels; level++) {
          var r    = (outerRadius / levels) * level;
          var pts  = [];
          for (var i = 0; i < n; i++) {
            var a = angleStep * i - Math.PI / 2;
            pts.push((cx + r * Math.cos(a)) + "," + (cy + r * Math.sin(a)));
          }
          var polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
          polygon.setAttribute("points",       pts.join(" "));
          polygon.setAttribute("fill",         "none");
          polygon.setAttribute("stroke",       "#e9ecef");
          polygon.setAttribute("stroke-width", "1");
          gridG.appendChild(polygon);
          // Scale value label at 12-o'clock of each ring level (matching Chart.js radar)
          var ringVal = Math.round((maxVal / levels) * level);
          var valLbl  = self._createText(cx + 4, cy - r + 11, ringVal.toLocaleString(), "start");
          valLbl.setAttribute("font-size", "0.625rem");
          gridG.appendChild(valLbl);
        }
        for (var j = 0; j < n; j++) {
          var ax = angleStep * j - Math.PI / 2;
          gridG.appendChild(this._createLine(cx, cy,
            cx + outerRadius * Math.cos(ax),
            cy + outerRadius * Math.sin(ax)
          ));
        }
        this._svg.appendChild(gridG);
      }

      var axisG = this._createGroup("chart-axis");
      labels.forEach(function (label, idx) {
        var a      = angleStep * idx - Math.PI / 2;
        var lx     = cx + (outerRadius + 18) * Math.cos(a);
        var ly     = cy + (outerRadius + 18) * Math.sin(a);
        var anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
        axisG.appendChild(self._createText(lx, ly + 4, label, anchor));
      });
      this._svg.appendChild(axisG);

      datasets.forEach(function (ds, dsIdx) {
        var color = self._colors[dsIdx % self._colors.length];
        var dsG   = document.createElementNS("http://www.w3.org/2000/svg", "g");
        dsG.setAttribute("data-ds", dsIdx);
        var pts   = [];
        ds.data.forEach(function (val, idx) {
          var a = angleStep * idx - Math.PI / 2;
          var r = ((val || 0) / maxVal) * outerRadius;
          pts.push((cx + r * Math.cos(a)) + "," + (cy + r * Math.sin(a)));
        });

        var polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points",       pts.join(" "));
        polygon.setAttribute("fill",         color);
        polygon.setAttribute("fill-opacity", "0.2");
        polygon.setAttribute("stroke",       color);
        polygon.setAttribute("stroke-width", "2");
        dsG.appendChild(polygon);

        ds.data.forEach(function (val, idx) {
          var a      = angleStep * idx - Math.PI / 2;
          var r      = ((val || 0) / maxVal) * outerRadius;
          var px     = cx + r * Math.cos(a);
          var py     = cy + r * Math.sin(a);
          var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx",           px);
          circle.setAttribute("cy",           py);
          circle.setAttribute("r",            "4");
          circle.setAttribute("fill",         color);
          circle.setAttribute("stroke-width", "2");
          if (self._config.showTooltip) {
            (function (el, lbl, v, c) {
              el.addEventListener("mouseenter", function () {
                self._showTooltip(el, { title: lbl, items: [{ color: c, text: (ds.label || "Dataset") + ": " + v }] });
              });
            })(circle, labels[idx], val, color);
            circle.addEventListener("mouseleave", function () { self._hideTooltip(); });
          }
          dsG.appendChild(circle);
        });
        self._svg.appendChild(dsG);
      });
    }

    // ----------------------------------------------------------------
    // Bubble
    // ----------------------------------------------------------------
    _renderBubble(width, height) {
      var p        = this._config.padding;
      var chartW   = width  - p.left - p.right;
      var chartH   = height - p.top  - p.bottom;
      var datasets = this._config.datasets;
      if (!datasets.length) return;

      var allX = [], allY = [], allR = [];
      datasets.forEach(function (ds) {
        (ds.data || []).forEach(function (pt) {
          allX.push(pt.x || 0);
          allY.push(pt.y || 0);
          allR.push(pt.r || 5);
        });
      });
      if (!allX.length) return;

      var minX  = Math.min.apply(null, allX);
      var maxX  = Math.max.apply(null, allX);
      var minY  = Math.min.apply(null, allY);
      var maxY  = Math.max.apply(null, allY);
      var maxR  = Math.max.apply(null, allR) || 1;
      var xPad  = ((maxX - minX) || 1) * 0.25;
      var yPad  = ((maxY - minY) || 1) * 0.25;
      minX -= xPad; maxX += xPad;
      minY -= yPad; maxY += yPad;
      var xRange = maxX - minX || 1;
      var yRange = maxY - minY || 1;
      var self   = this;

      // Instance state for toggle/rescale animations (mirrors _polarHidden pattern)
      this._bubbleDatasets    = datasets;
      this._bubbleHidden      = new Set();
      this._bubbleCircles     = [];
      this._bubbleAxisXTexts  = [];
      this._bubbleAxisYTexts  = [];
      this._bubbleMaxR        = maxR;
      this._bubblePad         = p;
      this._bubbleW           = chartW;
      this._bubbleH           = chartH;

      function xToSVG(x) { return p.left + ((x - minX) / xRange) * chartW; }
      function yToSVG(y) { return p.top  + chartH - ((y - minY) / yRange) * chartH; }

      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        for (var i = 0; i <= 5; i++) {
          var gy = p.top + chartH - (chartH / 5) * i;
          gridG.appendChild(this._createLine(p.left, gy, p.left + chartW, gy));
          var gx = p.left + (chartW / 5) * i;
          gridG.appendChild(this._createLine(gx, p.top, gx, p.top + chartH));
        }
        this._svg.appendChild(gridG);
      }

      var axisG = this._createGroup("chart-axis");
      for (var j = 0; j <= 5; j++) {
        var xVal = minX + (xRange / 5) * j;
        var xPos = p.left + (chartW / 5) * j;
        var xTxt = this._createText(xPos, p.top + chartH + 20, +xVal.toFixed(1), "middle");
        axisG.appendChild(xTxt);
        this._bubbleAxisXTexts.push(xTxt);

        var yVal = minY + (yRange / 5) * j;
        var yPos = p.top + chartH - (chartH / 5) * j;
        var yTxt = this._createText(p.left - 8, yPos + 4, +yVal.toFixed(1), "end");
        axisG.appendChild(yTxt);
        this._bubbleAxisYTexts.push(yTxt);
      }
      this._svg.appendChild(axisG);

      datasets.forEach(function (ds, dsIdx) {
        var color = ds.color || self._colors[dsIdx % self._colors.length];
        var dsG   = document.createElementNS("http://www.w3.org/2000/svg", "g");
        var dsPts = [];
        dsG.setAttribute("data-ds", dsIdx);

        (ds.data || []).forEach(function (pt, ptIdx) {
          var bx     = xToSVG(pt.x || 0);
          var by     = yToSVG(pt.y || 0);
          var br     = Math.max(4, ((pt.r || 5) / maxR) * 32);
          var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx",           bx);
          circle.setAttribute("cy",           by);
          circle.setAttribute("r",            self._config.animated ? 0 : br);
          circle.setAttribute("fill",         color);
          circle.setAttribute("fill-opacity", "0.5");
          circle.setAttribute("stroke",       color);
          circle.setAttribute("stroke-width", "1.5");
          circle.setAttribute("opacity",      "1");

          circle._currentCx      = bx;
          circle._currentCy      = by;
          circle._currentOpacity = 1;
          circle._targetR        = br;
          circle._animRaf        = null;

          if (self._config.animated) {
            var delay = (dsIdx * 0.12 + ptIdx * 0.06).toFixed(2);
            var anim  = document.createElementNS("http://www.w3.org/2000/svg", "animate");
            anim.setAttribute("attributeName", "r");
            anim.setAttribute("from",          "0");
            anim.setAttribute("to",            br);
            anim.setAttribute("dur",           "0.45s");
            anim.setAttribute("begin",         delay + "s");
            anim.setAttribute("fill",          "freeze");
            anim.setAttribute("calcMode",      "spline");
            anim.setAttribute("keySplines",    "0.25 0.46 0.45 0.94");
            anim.setAttribute("keyTimes",      "0;1");
            circle.appendChild(anim);
          }

          circle.addEventListener("mouseenter", function () {
            if (circle._currentOpacity < 0.5) return;
            circle.setAttribute("r", String(circle._targetR + 3));
            if (self._config.showTooltip) {
              self._showTooltip(circle, { title: ds.label || "Dataset", items: [{ color: color, text: "(" + pt.x + ", " + pt.y + ")  r=" + pt.r }] });
            }
          });
          circle.addEventListener("mouseleave", function () {
            circle.setAttribute("r", String(circle._targetR));
            self._hideTooltip();
          });

          dsPts.push(circle);
          dsG.appendChild(circle);
        });

        self._bubbleCircles.push(dsPts);
        self._svg.appendChild(dsG);
      });
    }

    // ----------------------------------------------------------------
    // Bubble: per-circle rAF animator (cx, cy, opacity)
    // ----------------------------------------------------------------
    _animateBubbleCircle(circle, fromCx, toCx, fromCy, toCy, fromOp, toOp, duration) {
      var start = null;
      if (circle._animRaf) cancelAnimationFrame(circle._animRaf);
      if (toOp === 0) circle.style.pointerEvents = "none";

      function tick(ts) {
        if (!start) start = ts;
        var t     = Math.min((ts - start) / duration, 1);
        var eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
        var cx    = fromCx + (toCx - fromCx) * eased;
        var cy    = fromCy + (toCy - fromCy) * eased;
        var op    = fromOp + (toOp - fromOp) * eased;

        circle._currentCx      = cx;
        circle._currentCy      = cy;
        circle._currentOpacity = op;

        circle.setAttribute("cx",      cx);
        circle.setAttribute("cy",      cy);
        circle.setAttribute("opacity", op);

        if (t < 1) {
          circle._animRaf = requestAnimationFrame(tick);
        } else {
          circle._animRaf = null;
          if (toOp > 0) circle.style.pointerEvents = "";
        }
      }
      circle._animRaf = requestAnimationFrame(tick);
    }

    // ----------------------------------------------------------------
    // Bubble: rescale to visible data and animate all circles
    // ----------------------------------------------------------------
    _updateBubbleChart(duration) {
      var self     = this;
      var datasets = this._bubbleDatasets;
      var hidden   = this._bubbleHidden;
      var p        = this._bubblePad;
      var chartW   = this._bubbleW;
      var chartH   = this._bubbleH;
      var maxR     = this._bubbleMaxR;

      // Recompute range from visible datasets only
      var allX = [], allY = [];
      datasets.forEach(function (ds, idx) {
        if (hidden.has(idx)) return;
        (ds.data || []).forEach(function (pt) {
          allX.push(pt.x || 0);
          allY.push(pt.y || 0);
        });
      });
      if (!allX.length) return;

      var minX   = Math.min.apply(null, allX);
      var maxX   = Math.max.apply(null, allX);
      var minY   = Math.min.apply(null, allY);
      var maxY   = Math.max.apply(null, allY);
      var xPad   = ((maxX - minX) || 1) * 0.25;
      var yPad   = ((maxY - minY) || 1) * 0.25;
      minX -= xPad; maxX += xPad;
      minY -= yPad; maxY += yPad;
      var xRange = maxX - minX || 1;
      var yRange = maxY - minY || 1;

      function xToSVG(x) { return p.left + ((x - minX) / xRange) * chartW; }
      function yToSVG(y) { return p.top  + chartH - ((y - minY) / yRange) * chartH; }

      // Animate each circle to new position / opacity
      datasets.forEach(function (ds, dsIdx) {
        var circles = self._bubbleCircles[dsIdx] || [];
        (ds.data || []).forEach(function (pt, ptIdx) {
          var circle = circles[ptIdx];
          if (!circle) return;
          // Hidden bubbles slide to where they'd land on the new scale (may be off-screen)
          var toCx = xToSVG(pt.x || 0);
          var toCy = yToSVG(pt.y || 0);
          var toOp = hidden.has(dsIdx) ? 0 : 1;
          self._animateBubbleCircle(
            circle,
            circle._currentCx, toCx,
            circle._currentCy, toCy,
            circle._currentOpacity, toOp,
            duration
          );
        });
      });

      // Update axis label values (positions stay fixed; only the numbers change)
      for (var j = 0; j <= 5; j++) {
        if (self._bubbleAxisXTexts[j]) {
          self._bubbleAxisXTexts[j].textContent = (+(minX + xRange / 5 * j).toFixed(1)).toString();
        }
        if (self._bubbleAxisYTexts[j]) {
          self._bubbleAxisYTexts[j].textContent = (+(minY + yRange / 5 * j).toFixed(1)).toString();
        }
      }
    }

    // ----------------------------------------------------------------
    // Scatter
    // ----------------------------------------------------------------
    _renderScatter(width, height) {
      var p        = this._config.padding;
      var chartW   = width  - p.left - p.right;
      var chartH   = height - p.top  - p.bottom;
      var datasets = this._config.datasets;
      var logX     = this._config.xScale === "log";
      if (!datasets.length) return;

      var allX = [], allY = [];
      datasets.forEach(function (ds) {
        (ds.data || []).forEach(function (pt) {
          allX.push(pt.x || 0);
          allY.push(pt.y || 0);
        });
      });
      if (!allX.length) return;

      var minX = Math.min.apply(null, allX);
      var maxX = Math.max.apply(null, allX);
      var minY = Math.min.apply(null, allY);
      var maxY = Math.max.apply(null, allY);

      // X scale setup
      var logMinX, logMaxX, logXRange, xRange;
      if (logX) {
        var rawLogMin = Math.log10(Math.max(minX, 1e-10));
        var rawLogMax = Math.log10(Math.max(maxX, 1e-10));
        // Anchor decade marks to chart edges: xToSVG(10^logMinX) === p.left, xToSVG(10^logMaxX) === p.left+chartW
        logMinX   = Math.floor(rawLogMin);
        logMaxX   = Math.ceil(rawLogMax);
        logXRange = logMaxX - logMinX || 1;
      } else {
        var xPad = ((maxX - minX) || 1) * 0.1;
        minX -= xPad; maxX += xPad;
        xRange = maxX - minX || 1;
      }
      // Y nice scale: round to clean tick values matching v8 Chart.js behavior
      var yNice  = this._niceScale(minY, maxY, 8);
      minY       = yNice.min;
      maxY       = yNice.max;
      var yStep  = yNice.step;
      var yTicks = Math.round((maxY - minY) / yStep) + 1;
      var yRange = maxY - minY || 1;
      var self   = this;

      function xToSVG(x) {
        if (logX) return p.left + ((Math.log10(Math.max(x, 1e-10)) - logMinX) / logXRange) * chartW;
        return p.left + ((x - minX) / xRange) * chartW;
      }
      function yToSVG(y) { return p.top + chartH - ((y - minY) / yRange) * chartH; }

      // Grid lines
      if (this._config.showGrid) {
        var gridG = this._createGroup("chart-grid");
        // Log scatter: no vertical grid lines (matches v8 behavior); linear scatter keeps them
        if (!logX) {
          for (var gi = 0; gi <= 5; gi++) {
            var ggx2 = p.left + (chartW / 5) * gi;
            gridG.appendChild(this._createLine(ggx2, p.top, ggx2, p.top + chartH));
          }
        }
        // Horizontal lines at nice y ticks
        for (var gh = 0; gh < yTicks; gh++) {
          var ggy = yToSVG(minY + yStep * gh);
          gridG.appendChild(this._createLine(p.left, ggy, p.left + chartW, ggy));
        }
        this._svg.appendChild(gridG);
      }

      // Axis labels
      var axisG = this._createGroup("chart-axis");
      if (logX) {
        // 1, 2, 5 per decade labels — matches v8 Chart.js log scale ticks
        var logMults  = [1, 2, 5];
        var xDataMax  = Math.pow(10, logMaxX);
        for (var ae = logMinX; ae <= logMaxX; ae++) {
          for (var mi = 0; mi < logMults.length; mi++) {
            var axv = logMults[mi] * Math.pow(10, ae);
            if (axv > xDataMax + 1e-6) continue;
            var axlb = axv >= 1e6  ? (axv / 1e6).toFixed(0) + 'M'
                     : axv >= 1000 ? (axv / 1000).toFixed(0) + ',000'
                     : String(axv);
            axisG.appendChild(this._createText(xToSVG(axv), p.top + chartH + 20, axlb, "middle"));
          }
        }
      } else {
        for (var aj = 0; aj <= 5; aj++) {
          var axvl = minX + (xRange / 5) * aj;
          axisG.appendChild(this._createText(p.left + (chartW / 5) * aj, p.top + chartH + 20, +axvl.toFixed(1), "middle"));
        }
      }
      // Y labels at nice ticks
      for (var ak = 0; ak < yTicks; ak++) {
        var ayvl   = minY + yStep * ak;
        var ayp    = yToSVG(ayvl);
        var ayLabel = yStep >= 1 ? Math.round(ayvl) : +ayvl.toPrecision(3);
        axisG.appendChild(this._createText(p.left - 8, ayp + 4, ayLabel, "end"));
      }
      this._svg.appendChild(axisG);

      // Dots — rAF pop-in matching v8's simultaneous easeOutQuart reveal.
      // Pure rAF (no SMIL) avoids SMIL-freeze/setAttribute conflicts and CSS-transition
      // interference. All dots in a dataset grow together; datasets stagger by 80 ms.
      this._scatterCircles = [];
      this._scatterGroups  = [];
      this._scatterFloor   = p.top + chartH;

      datasets.forEach(function (ds, dsIdx) {
        var color = ds.color || self._colors[dsIdx % self._colors.length];
        var dsG   = document.createElementNS("http://www.w3.org/2000/svg", "g");
        var dsPts = [];
        dsG.setAttribute("data-ds", dsIdx);

        (ds.data || []).forEach(function (pt) {
          var sx     = xToSVG(pt.x || 0);
          var sy     = yToSVG(pt.y || 0);
          var dotR   = 5;
          var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          // cx/cy at origin; transform positions + scales the dot so scale(0→1) is a
          // clear grow-from-point animation (same approach Chart.js uses on canvas)
          circle.setAttribute("cx",           0);
          circle.setAttribute("cy",           0);
          circle.setAttribute("r",            dotR);
          circle.setAttribute("fill",         color);
          circle.setAttribute("fill-opacity", "0.5");
          circle.setAttribute("stroke",       color);
          circle.setAttribute("stroke-width", "1.5");
          if (self._config.animated) {
            circle.setAttribute("transform", "translate(" + sx + "," + sy + ") scale(0)");
          } else {
            circle.setAttribute("cx", sx);
            circle.setAttribute("cy", sy);
          }
          circle._cx       = sx;
          circle._cy       = sy;
          circle._targetR  = dotR;
          circle._currR    = dotR;
          circle._currCy   = null; // null = natural position
          circle._currOp   = null; // null = fully visible
          circle._animDone = !self._config.animated;

          circle.addEventListener("mouseenter", function () {
            if (!circle._animDone) return;
            circle.setAttribute("r", String(circle._targetR + 2));
            if (self._config.showTooltip) {
              self._showTooltip(circle, { title: ds.label || "Dataset", items: [{ color: color, text: "(" + pt.x + ", " + pt.y + ")" }] });
            }
          });
          circle.addEventListener("mouseleave", function () {
            if (!circle._animDone) return;
            circle.setAttribute("r", String(circle._targetR));
            self._hideTooltip();
          });

          dsPts.push(circle);
          dsG.appendChild(circle);
        });

        self._scatterCircles[dsIdx] = dsPts;
        self._scatterGroups[dsIdx]  = dsG;
        self._svg.appendChild(dsG);

        // Scale(0→1) via SVG transform — visually unambiguous grow-from-point animation
        if (self._config.animated && dsPts.length) {
          (function (circles, delay) {
            setTimeout(function () {
              var start = null;
              var dur   = 900;
              function tick(ts) {
                if (!start) start = ts;
                var t     = Math.min((ts - start) / dur, 1);
                var eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
                circles.forEach(function (c) {
                  c.setAttribute("transform",
                    "translate(" + c._cx + "," + c._cy + ") scale(" + eased + ")");
                });
                if (t < 1) {
                  requestAnimationFrame(tick);
                } else {
                  circles.forEach(function (c) {
                    c.setAttribute("cx", c._cx);
                    c.setAttribute("cy", c._cy);
                    c.removeAttribute("transform");
                    c._animDone = true;
                  });
                }
              }
              requestAnimationFrame(tick);
            }, delay);
          })(dsPts, dsIdx * 80);
        }
      });
    }

    // ----------------------------------------------------------------
    // Scatter — legend toggle: shrink/grow dot radius to/from 0
    // ----------------------------------------------------------------
    // Scatter — legend toggle: staggered per-dot slide + fade.
    // Show: dots slide up from below and fade in sequentially (first→last).
    // Hide: reversed order — last dot goes first, sliding down and fading out.
    _animateScatterToggle(dsIdx, toHide, duration) {
      var circles = this._scatterCircles && this._scatterCircles[dsIdx];
      var dsG     = this._scatterGroups  && this._scatterGroups[dsIdx];
      if (!circles || !circles.length) return;

      if (dsG && dsG._animRaf) { cancelAnimationFrame(dsG._animRaf); dsG._animRaf = null; }

      var n       = circles.length;
      var stagger = Math.min(40, 600 / Math.max(n, 1)); // ms delay between each dot
      var floor   = this._scatterFloor;                 // x-axis y-coordinate
      var order   = toHide ? circles.slice().reverse() : circles.slice();

      if (toHide && dsG) dsG.style.pointerEvents = "none";

      // Capture from-state for each circle (supports mid-animation reversal)
      order.forEach(function (c) {
        c._fromCy = (c._currCy != null) ? c._currCy : c._cy;
        c._fromOp = (c._currOp != null) ? c._currOp : 1;
        c._toCy   = toHide ? floor : c._cy;
        c._toOp   = toHide ? 0 : 1;
      });

      var globalStart = null;

      function tick(ts) {
        if (!globalStart) globalStart = ts;
        var elapsed = ts - globalStart;
        var allDone = true;

        order.forEach(function (c, i) {
          var local = elapsed - i * stagger;
          if (local < 0) { allDone = false; return; }
          var t  = Math.min(local / duration, 1);
          if (t < 1) allDone = false;
          var e  = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          // Fade completes at 55% of the slide duration on show, full duration on hide
          var tO = toHide ? t : Math.min(local / (duration * 0.55), 1);
          var eO = tO < 0.5 ? 2 * tO * tO : 1 - Math.pow(-2 * tO + 2, 2) / 2;
          c._currCy = c._fromCy + (c._toCy - c._fromCy) * e;
          c._currOp = c._fromOp + (c._toOp - c._fromOp) * eO;
          c.setAttribute("cy",      c._currCy);
          c.setAttribute("opacity", c._currOp);
        });

        if (!allDone) {
          if (dsG) dsG._animRaf = requestAnimationFrame(tick);
        } else {
          if (dsG) dsG._animRaf = null;
          order.forEach(function (c) {
            c._currCy = c._toCy;
            c._currOp = c._toOp;
            c.setAttribute("cy", c._toCy);
            if (toHide) {
              c.setAttribute("opacity", 0);
            } else {
              c.removeAttribute("opacity"); // restore natural fill-opacity
              c._currCy = c._cy;
              c._currOp = null;
            }
          });
          if (!toHide && dsG) dsG.style.pointerEvents = "";
        }
      }

      if (dsG) dsG._animRaf = requestAnimationFrame(tick);
    }

    // ----------------------------------------------------------------
    // Bar (vertical) — legend toggle: animate height to/from 0 at baseline
    // ----------------------------------------------------------------
    _animateBarsV(dsIdx, toHide, duration) {
      var rects = this._barRects  && this._barRects[dsIdx];
      var dsG   = this._barGroups && this._barGroups[dsIdx];
      var floor = this._barFloor;
      if (!rects || !rects.length) return;

      if (dsG && dsG._animRaf) { cancelAnimationFrame(dsG._animRaf); dsG._animRaf = null; }

      rects.forEach(function (rect) {
        while (rect.firstChild) rect.removeChild(rect.firstChild);
        rect.setAttribute("y",      rect._currY);
        rect.setAttribute("height", rect._currH);
        rect._fromH = rect._currH;
        rect._fromY = rect._currY;
        rect._toH   = toHide ? 0     : rect._barH;
        rect._toY   = toHide ? floor : rect._barY;
      });
      if (toHide && dsG) dsG.style.pointerEvents = "none";

      var start = null;
      function tick(ts) {
        if (!start) start = ts;
        var t = Math.min((ts - start) / duration, 1);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        rects.forEach(function (rect) {
          var h = Math.max(0, rect._fromH + (rect._toH - rect._fromH) * e);
          var y = rect._fromY + (rect._toY - rect._fromY) * e;
          rect.setAttribute("height", h);
          rect.setAttribute("y",      y);
          rect._currH = h;
          rect._currY = y;
        });
        if (t < 1) {
          if (dsG) dsG._animRaf = requestAnimationFrame(tick);
        } else {
          if (dsG) { dsG._animRaf = null; if (!toHide) dsG.style.pointerEvents = ""; }
        }
      }
      if (dsG) dsG._animRaf = requestAnimationFrame(tick);
    }

    // ----------------------------------------------------------------
    // Bar (horizontal) — legend toggle: animate width to/from 0 at axis
    // ----------------------------------------------------------------
    _animateBarsH(dsIdx, toHide, duration) {
      var rects = this._horizRects  && this._horizRects[dsIdx];
      var dsG   = this._horizGroups && this._horizGroups[dsIdx];
      if (!rects || !rects.length) return;

      if (dsG && dsG._animRaf) { cancelAnimationFrame(dsG._animRaf); dsG._animRaf = null; }

      rects.forEach(function (rect) {
        while (rect.firstChild) rect.removeChild(rect.firstChild);
        rect.setAttribute("width", rect._currW);
        rect._fromW = rect._currW;
        rect._toW   = toHide ? 0 : rect._barW;
      });
      if (toHide && dsG) dsG.style.pointerEvents = "none";

      var start = null;
      function tick(ts) {
        if (!start) start = ts;
        var t = Math.min((ts - start) / duration, 1);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        rects.forEach(function (rect) {
          var w = Math.max(0, rect._fromW + (rect._toW - rect._fromW) * e);
          rect.setAttribute("width", w);
          rect._currW = w;
        });
        if (t < 1) {
          if (dsG) dsG._animRaf = requestAnimationFrame(tick);
        } else {
          if (dsG) { dsG._animRaf = null; if (!toHide) dsG.style.pointerEvents = ""; }
        }
      }
      if (dsG) dsG._animRaf = requestAnimationFrame(tick);
    }

    // ----------------------------------------------------------------
    // Legend — with click-to-toggle
    // ----------------------------------------------------------------
    _renderLegend() {
      var legend   = document.createElement("div");
      legend.className = "chart-legend";
      var datasets = this._config.datasets;
      var labels   = this._config.labels;
      var type     = this._config.type;
      var self     = this;

      var isPolar      = type === "polar" || type === "polarArea";
      var useLabels    = type === "pie" || type === "doughnut" || isPolar;
      var legendTxtClr = this._config.legendLabelColor || null;

      if (isPolar) {
        // Polar: JS-driven rescale animation matching Chart.js canvas behaviour.
        // Toggling a slice re-derives maxVal from visible data and animates all slices.
        labels.forEach(function (label, idx) {
          var item  = self._createLegendItem(label, self._colors[idx % self._colors.length], legendTxtClr);
          var slice = idx;
          item.addEventListener("click", function () {
            if (self._polarHidden.has(slice)) {
              self._polarHidden.delete(slice);
            } else {
              self._polarHidden.add(slice);
            }
            item.classList.toggle("chart-legend-item--hidden", self._polarHidden.has(slice));
            self._updatePolarChart(350);
          });
          legend.appendChild(item);
        });

      } else if (useLabels) {
        // Pie / doughnut: redistribute visible slices to fill 360°
        labels.forEach(function (label, idx) {
          var item  = self._createLegendItem(label, self._colors[idx % self._colors.length], legendTxtClr);
          var slice = idx;
          item.addEventListener("click", function () {
            if (self._pieHidden.has(slice)) {
              self._pieHidden.delete(slice);
            } else {
              self._pieHidden.add(slice);
            }
            item.classList.toggle("chart-legend-item--hidden", self._pieHidden.has(slice));
            self._updatePieChart(350);
          });
          legend.appendChild(item);
        });
      } else {
        datasets.forEach(function (ds, idx) {
          var color = (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : null)
                   || ds.color
                   || ds.borderColor
                   || self._colors[idx % self._colors.length];
          var item  = self._createLegendItem(ds.label || "Dataset " + (idx + 1), color, legendTxtClr);
          var dsIdx = idx;
          item.addEventListener("click", function () {
            if (type === "bubble" && self._bubbleHidden) {
              // Bubble: rescale axis and slide all circles to new positions
              if (self._bubbleHidden.has(dsIdx)) {
                self._bubbleHidden.delete(dsIdx);
              } else {
                self._bubbleHidden.add(dsIdx);
              }
              item.classList.toggle("chart-legend-item--hidden", self._bubbleHidden.has(dsIdx));
              self._updateBubbleChart(400);
            } else {
              var target = self._svg.querySelector('[data-ds="' + dsIdx + '"]');
              if (!target) return;
              var isHidden = target.getAttribute("data-hidden") === "1";
              target.setAttribute("data-hidden", isHidden ? "0" : "1");
              var toHide = !isHidden;
              if (type === "bar" && self._config.indexAxis === "y" && self._horizRects) {
                self._animateBarsH(dsIdx, toHide, 400);
              } else if (type === "bar" && self._barRects && self._barRects[dsIdx]) {
                self._animateBarsV(dsIdx, toHide, 400);
              } else if (type === "scatter" && self._scatterCircles) {
                self._animateScatterToggle(dsIdx, toHide, 400);
              } else {
                if (isHidden) {
                  target.style.opacity       = "";
                  target.style.pointerEvents = "";
                } else {
                  target.style.opacity       = "0";
                  target.style.pointerEvents = "none";
                }
              }
              item.classList.toggle("chart-legend-item--hidden", !isHidden);
            }
          });
          legend.appendChild(item);
        });
      }

      this._element.appendChild(legend);
    }

    _createLegendItem(label, color, textColor) {
      var item   = document.createElement("div");
      item.className = "chart-legend-item";
      item.style.cssText = "display:inline-flex;align-items:center;height:20px;gap:6px;cursor:pointer;user-select:none;transition:opacity 0.15s;";
      var swatch = document.createElement("span");
      swatch.className = "chart-legend-color";
      swatch.style.cssText = "display:block;width:12px;height:12px;min-height:12px;border-radius:2px;flex-shrink:0;align-self:center;background-color:" + color + ";";
      var text   = document.createElement("span");
      text.className = "chart-legend-label";
      if (textColor) text.style.color = textColor;
      text.textContent = label;
      item.appendChild(swatch);
      item.appendChild(text);
      return item;
    }

    // ----------------------------------------------------------------
    // Scale helpers
    // ----------------------------------------------------------------
    _niceScale(minV, maxV, targetIntervals) {
      var range = maxV - minV;
      if (range === 0) range = Math.abs(minV) || 1;
      var rawStep = range / targetIntervals;
      var mag     = Math.pow(10, Math.floor(Math.log10(rawStep)));
      var norm    = rawStep / mag;
      var niceStep = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
      niceStep *= mag;
      return {
        min:  Math.floor(minV / niceStep) * niceStep,
        max:  Math.ceil(maxV  / niceStep) * niceStep,
        step: niceStep
      };
    }

    // ----------------------------------------------------------------
    // SVG helpers
    // ----------------------------------------------------------------
    _createGroup(className) {
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", className);
      return g;
    }

    _createLine(x1, y1, x2, y2) {
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      return line;
    }

    _createText(x, y, text, anchor) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "text");
      el.setAttribute("x",            x);
      el.setAttribute("y",            y);
      el.setAttribute("text-anchor",  anchor || "start");
      el.textContent = text;
      return el;
    }

    _showTooltip(elOrEvent, data) {
      if (!this._tooltip) return;
      this._tooltip.innerHTML = "";

      if (data.title) {
        var titleEl = document.createElement("div");
        titleEl.className = "chart-tooltip-title";
        titleEl.textContent = data.title;
        this._tooltip.appendChild(titleEl);
      }

      (data.items || []).forEach(function (item) {
        var row = document.createElement("div");
        row.className = "chart-tooltip-item";
        if (item.color) {
          var swatch = document.createElement("span");
          swatch.className = "chart-tooltip-swatch";
          swatch.style.background = item.color;
          row.appendChild(swatch);
        }
        var text = document.createElement("span");
        text.textContent = item.text;
        row.appendChild(text);
        this._tooltip.appendChild(row);
      }, this);

      this._positionTooltip(elOrEvent);
      this._tooltip.classList.add("show");
    }

    _positionTooltip(elOrEvent) {
      if (!this._tooltip) return;
      var chartRect = this._element.getBoundingClientRect();
      var ttW       = this._tooltip.offsetWidth  || 100;
      var ttH       = this._tooltip.offsetHeight || 40;
      var caret     = "bottom";
      var left, top;
      var pad = 4, c = 6; // pad=edge clearance, c=caret size

      if (typeof elOrEvent.clientX === "number") {
        var mx = elOrEvent.clientX - chartRect.left;
        var my = elOrEvent.clientY - chartRect.top;

        if (my - ttH - c >= pad) {
          // Above cursor
          top   = my - ttH - c;
          left  = Math.max(pad, Math.min(mx - ttW / 2, chartRect.width - ttW - pad));
          caret = "bottom";
        } else if (my + c + ttH <= chartRect.height - pad) {
          // Below cursor
          top   = my + c;
          left  = Math.max(pad, Math.min(mx - ttW / 2, chartRect.width - ttW - pad));
          caret = "top";
        } else if (mx + c + ttW <= chartRect.width - pad) {
          // Right of cursor
          left  = mx + c;
          top   = Math.max(pad, Math.min(my - ttH / 2, chartRect.height - ttH - pad));
          caret = "left";
        } else {
          // Left of cursor
          left  = Math.max(pad, mx - ttW - c);
          top   = Math.max(pad, Math.min(my - ttH / 2, chartRect.height - ttH - pad));
          caret = "right";
        }

        this._tooltip.classList.remove("caret-top", "caret-left", "caret-right");
        if (caret !== "bottom") this._tooltip.classList.add("caret-" + caret);
      } else {
        var elRect    = elOrEvent.getBoundingClientRect();
        var elCenterX = elRect.left + elRect.width  / 2 - chartRect.left;
        var elTopY    = elRect.top  - chartRect.top;
        left = Math.max(pad, Math.min(elCenterX - ttW / 2, chartRect.width - ttW - pad));
        top  = elTopY - ttH - c;
        this._tooltip.classList.remove("caret-top", "caret-left", "caret-right");
      }

      this._tooltip.style.left = left + "px";
      this._tooltip.style.top  = top  + "px";
    }

    _moveTooltip(e) {
      if (!this._tooltip || !this._tooltip.classList.contains("show")) return;
      this._positionTooltip(e);
    }

    _hideTooltip() {
      if (this._tooltip) this._tooltip.classList.remove("show");
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = Chart.getInstance(this);
        if (!instance) {
          instance = new Chart(this, typeof config === "object" ? config : {});
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function")
            throw new TypeError("No method named " + config);
          instance[config]();
        }
      });
    }
  }

  function autoInit(root) {
    if (root === undefined) root = document;
    root.querySelectorAll("[data-cnds-chart-init]").forEach(function (el) {
      if (!Chart.getInstance(el)) new Chart(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { autoInit(); });
  } else {
    autoInit();
  }

  window.Nimbus       = window.Nimbus || {};
  window.Nimbus.Chart = Chart;
  if (window.Nimbus.DataAPI)
    window.Nimbus.DataAPI.registerComponent(NAME, Chart);
})();
