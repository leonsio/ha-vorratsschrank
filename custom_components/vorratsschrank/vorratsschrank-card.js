function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

async function photoPixels(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

class VorratsschrankCard extends HTMLElement {
  setConfig(config) {
    if (this.config?.entry_id !== config.entry_id) {
      this.entry = undefined;
      this.signature = undefined;
      this.data = undefined;
    }
    this.config = config;
    if (this.shadowRoot) this.build();
  }

  static getStubConfig() {
    return {};
  }

  set hass(value) {
    this.home = value;
    if (this.isConnected && !this.started) this.start();
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({mode: "open"});
    this.build();
    if (this.home) this.start();
  }

  disconnectedCallback() {
    clearInterval(this.timer);
    this.started = false;
    this.observer?.disconnect();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.update();
    this.timer = setInterval(() => this.update(), 5000);
  }

  build() {
    const style = element("style", `
      ha-card { padding: 16px; }
      h2 { font-size: 1.3rem; margin: 0 0 12px; }
      .toolbar, form, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .status { color: var(--secondary-text-color); margin: 8px 0; }
      .error { color: var(--error-color); }
      .item { border-top: 1px solid var(--divider-color); padding: 12px 0; }
      .row { display: flex; align-items: center; gap: 10px; }
      .row strong { display: block; overflow-wrap: anywhere; }
      .row img { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; border-radius: 8px; background: white; }
      .description { flex: 1; min-width: 0; }
      small { color: var(--secondary-text-color); }
      button, select, input:not([type=file]) {
        font: inherit; color: var(--primary-text-color); background: var(--card-background-color);
        border: 1px solid var(--divider-color); border-radius: 8px; min-height: 44px; padding: 6px 10px;
        box-sizing: border-box; max-width: 100%;
      }
      button { cursor: pointer; }
      button:disabled { opacity: .5; cursor: default; }
      .primary { color: var(--text-primary-color); background: var(--primary-color); }
      .toolbar input { flex: 1 1 180px; min-width: 0; }
      button.product { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
        text-align: start; border: 0; padding: 4px; }
      dialog {
        color: var(--primary-text-color); background: var(--card-background-color, white);
        border: 1px solid var(--divider-color); border-radius: 16px; box-sizing: border-box;
        width: min(540px, calc(100% - 24px)); max-height: 85dvh; padding: 18px; overflow: auto;
      }
      dialog::backdrop { background: rgba(0, 0, 0, .55); }
      .dialog-header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
      .dialog-header h2 { overflow-wrap: anywhere; }
      .product-image { display: block; max-width: 100%; width: 220px; height: 180px;
        margin: 12px auto; object-fit: contain; background: white; border-radius: 8px; }
      [hidden], .status:empty { display: none !important; }
      form { margin: 10px 0; }
      p { margin: 8px 0; overflow-wrap: anywhere; }
    `);
    this.card = element("ha-card");
    this.list = element("div");
    this.status = element("p", "", {class: "status", role: "status", "aria-live": "polite"});
    this.filter = element("select", undefined, {"aria-label": "Bestand nach Kategorie filtern"});
    this.filter.onchange = () => this.renderList();
    this.search = element("input", undefined, {
      type: "search", placeholder: "Name, Marke oder EAN", "aria-label": "Bestand durchsuchen",
    });
    this.search.oninput = () => this.renderList();
    this.category = element("select", undefined, {"aria-label": "Kategorie für Check-in"});
    this.code = element("input", undefined, {
      "aria-label": "Barcode", placeholder: "Barcode", inputmode: "numeric", maxlength: "256",
    });
    this.file = element("input", undefined, {type: "file", accept: "image/*", capture: "environment", hidden: ""});
    this.file.onchange = () => this.readPhoto();
    this.camera = this.button("Barcode fotografieren", () => this.file.click(), "primary");
    this.form = element("form");
    this.add = element("button", "Einbuchen", {type: "submit", class: "primary"});
    this.form.append(this.code, this.category, this.add);
    this.form.onsubmit = (event) => {
      event.preventDefault();
      const code = this.code.value.trim();
      if (!code) return this.notice("Bitte einen Barcode eingeben oder fotografieren.", true);
      this.run(async () => {
        const result = await this.action("in", {code, category_id: Number(this.category.value)});
        this.code.value = "";
        this.insertDialog.close();
        this.notice(`Eingebucht · ${result.quantity} Stück in dieser Kategorie`);
      });
    };
    const toolbar = element("div", undefined, {class: "toolbar"});
    this.insertDialog = this.dialog("Produkt hinzufügen", "vorrat-add-heading");
    this.insertDialog.body.append(this.camera, this.file, this.form);
    this.productDialog = this.dialog("", "vorrat-product-heading");
    this.productDialog.onclose = () => {
      if (!this.productDialog.open) this.selected = undefined;
    };
    toolbar.append(this.search, this.filter, this.button("＋ Hinzufügen", () => {
      this.insertDialog.message.textContent = "";
      this.category.value = String(this.data.default_category_id);
      this.insertDialog.showModal();
    }, "primary"));
    this.card.append(element("h2", this.config?.title || "Vorratsschrank"), toolbar,
      this.status, this.list, this.insertDialog, this.productDialog);
    this.shadowRoot.replaceChildren(style, this.card);
    this.pictures = new Map();
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(records => {
      for (const {target, isIntersecting} of records) {
        if (isIntersecting) {
          this.observer.unobserve(target);
          this.showImage(target);
        }
      }
    });
    if (this.data) this.render();
    this.setBusy(this.busy);
  }

  button(text, callback, className = "") {
    const button = element("button", text, {type: "button", class: className});
    button.onclick = callback;
    return button;
  }

  dialog(title, id) {
    const dialog = element("dialog", undefined, {"aria-labelledby": id});
    dialog.heading = element("h2", title, {id});
    dialog.message = element("p", "", {class: "status", role: "status"});
    dialog.body = element("div");
    const header = element("div", undefined, {class: "dialog-header"});
    const close = this.button("Schließen", () => dialog.close());
    close.dataset.navigation = "";
    close.setAttribute("autofocus", "");
    header.append(dialog.heading, close);
    dialog.append(header, dialog.message, dialog.body);
    return dialog;
  }

  request(operation, fields = {}) {
    return this.home.callWS({
      type: "vorratsschrank/dashboard", operation, entry_id: this.entry, ...fields,
    });
  }

  action(action, fields) {
    return this.request("action", {payload: {action, ...fields}});
  }

  async update(force = false) {
    if ((!force && this.busy) || this.loading) return;
    this.loading = true;
    try {
      if (!this.entry) {
        const entries = await this.request("entries");
        const entry = this.config?.entry_id || entries[0]?.id;
        if (!entries.some(candidate => candidate.id === entry)) {
          throw new Error("Vorratsschrank unter Geräte & Dienste einrichten.");
        }
        this.entry = entry;
      }
      const data = await this.request("inventory");
      const signature = JSON.stringify(data);
      if (this.signature !== signature) {
        this.signature = signature;
        this.data = data;
        this.render();
      }
      if (this.connectionError) this.notice("");
      this.connectionError = false;
    } catch (error) {
      this.connectionError = true;
      this.notice(error.message || "Bestand konnte nicht geladen werden.", true);
    } finally {
      this.loading = false;
      this.setBusy(this.busy);
    }
  }

  setBusy(busy) {
    this.busy = busy;
    if (!this.card) return;
    for (const button of this.card.querySelectorAll("button")) {
      if ("navigation" in button.dataset) continue;
      button.disabled = busy || !this.data?.writable || !!this.connectionError;
    }
  }

  notice(message, error = false) {
    const status = [this.insertDialog, this.productDialog].find(dialog => dialog.open)?.message || this.status;
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  async run(task, refresh = true) {
    if (this.busy) return;
    this.setBusy(true);
    try {
      await task();
      if (refresh) await this.update(true);
    } catch (error) {
      this.notice(error.message || "Vorgang fehlgeschlagen.", true);
    } finally {
      this.setBusy(false);
    }
  }

  readPhoto() {
    const [file] = this.file.files;
    this.file.value = "";
    if (!file) return;
    this.run(async () => {
      this.notice("Barcode wird gelesen …");
      const {readProductCode} = await import("./barcode-reader.js");
      const code = await readProductCode(await photoPixels(file));
      const result = await this.action("identify", {code});
      this.code.value = code;
      this.notice(`Erkannt · ${result.product.name}${result.best_before ? " · MHD " + result.best_before : ""}. Kategorie prüfen und einbuchen.`);
    }, false);
  }

  render() {
    for (const [select, allowAll] of [[this.filter, true], [this.category, false]]) {
      const previous = select.value;
      const options = this.data.categories.map(({id, name}) => element("option", name, {value: id}));
      if (allowAll) options.unshift(element("option", "Alle Kategorien", {value: ""}));
      select.replaceChildren(...options);
      select.value = options.some(option => option.value === previous) ? previous :
        allowAll ? "" : String(this.data.default_category_id);
    }
    this.renderList();
    if (this.productDialog.open) this.renderProduct();
  }

  renderList() {
    if (!this.data) return;
    this.observer.disconnect();
    const query = this.search.value.trim().toLocaleLowerCase();
    const rows = this.data.items.filter(item =>
      (!this.filter.value || String(item.category_id) === this.filter.value) &&
      [item.name, item.brand, item.ean].some(value => String(value ?? "").toLocaleLowerCase().includes(query))
    );
    this.list.replaceChildren(...rows.map(item => this.row(item)));
    if (!rows.length) this.list.append(element("p", query ? "Keine passenden Produkte." : "Hier ist kein Bestand vorhanden."));
    this.setBusy(this.busy);
  }

  picture(item, className = "") {
    const picture = element("img", undefined, {alt: "", class: className});
    picture.dataset.ean = item.ean;
    picture.dataset.version = item.image_version || "";
    return picture;
  }

  change(item, action, data = {}) {
    return this.run(async () => {
      const result = await this.action(action, {code: item.ean, category_id: item.category_id, ...data});
      if (action === "move" && this.selected?.ean === item.ean &&
          this.selected.category_id === item.category_id) {
        this.selected.category_id = data.target_category_id;
      }
      this.notice(action === "refresh"
        ? result.queued ? "Produktsuche eingeplant." : "Produktsuche läuft bereits."
        : "Bestand aktualisiert.");
    });
  }

  row(item) {
    const node = element("section", undefined, {class: "item"});
    const row = element("div", undefined, {class: "row"});
    const product = this.button("", () => {
      this.selected = {ean: item.ean, category_id: item.category_id};
      this.productDialog.message.textContent = "";
      this.renderProduct();
      this.productDialog.showModal();
    }, "product");
    product.dataset.navigation = "";
    product.setAttribute("aria-haspopup", "dialog");
    if (item.image_path) {
      const picture = this.picture(item);
      product.append(picture);
      this.observer.observe(picture);
    }
    const description = element("div", undefined, {class: "description"});
    description.append(element("strong", item.name), element("small", `${item.category} · ${item.quantity} Stück`));
    product.append(description);
    const minus = this.button("−", () => this.change(item, "out"));
    minus.setAttribute("aria-label", `Ein Stück ${item.name} entnehmen`);
    const plus = this.button("+", () => this.change(item, "in"));
    plus.setAttribute("aria-label", `Ein Stück ${item.name} hinzufügen`);
    row.append(product, minus, plus);
    node.append(row);
    return node;
  }

  renderProduct() {
    const item = this.data.items.find(candidate =>
      candidate.ean === this.selected?.ean && candidate.category_id === this.selected.category_id);
    if (!item) {
      this.productDialog.close();
      return;
    }
    const signature = JSON.stringify([item, this.data.categories.map(({id, name}) => [id, name])]);
    if (this.productDialog.signature === signature) return;
    this.productDialog.signature = signature;
    this.productDialog.heading.textContent = item.name;
    const details = this.productDialog.body;
    details.replaceChildren(element("p", `${item.category} · ${item.quantity} Stück`));
    if (item.image_path) {
      const picture = this.picture(item, "product-image");
      picture.alt = item.name;
      details.append(picture);
      this.showImage(picture);
    }
    const change = (action, data) => this.change(item, action, data);
    details.append(this.button("Produktdaten und Bild aktualisieren", () => change("refresh")));
    const targets = this.data.categories.filter(({id}) => id !== item.category_id);
    if (targets.length) {
      const move = element("form");
      const target = element("select", undefined, {"aria-label": "Zielkategorie"});
      target.append(...targets.map(({id, name}) => element("option", name, {value: id})));
      move.append(target, this.button("Kategorie wechseln", () =>
        change("move", {target_category_id: Number(target.value)})));
      move.onsubmit = event => event.preventDefault();
      details.append(move);
    }
    details.append(element("p", [item.ean, item.brand, item.package_size].filter(Boolean).join(" · ")));
    if (item.ingredients) details.append(element("p", item.ingredients));
    details.append(this.button("Name ändern", () => {
      const name = window.prompt("Produktname für alle Kategorien", item.name);
      if (name !== null) change("rename", {name});
    }));
    for (const lot of item.lots) {
      const line = element("p");
      const date = element("input", undefined, {type: "date", "aria-label": "MHD für ein Stück"});
      date.value = lot.best_before || "";
      line.append(element("span", `${lot.quantity} × `), date,
        this.button("Für 1 Stück speichern", () => change("date", {old: lot.best_before, best_before: date.value || null})));
      details.append(line);
    }
    details.append(this.button("Bestand hier löschen", () => {
      if (window.confirm(`Alle ${item.quantity} Stück von ${item.name} aus ${item.category} entfernen?`)) change("delete");
    }));
    this.setBusy(this.busy);
  }

  async showImage(target) {
    const {ean, version} = target.dataset;
    let picture = this.pictures.get(ean);
    if (picture?.version !== version) {
      picture = {version, request: this.request("image", {ean})};
      this.pictures.set(ean, picture);
    }
    try {
      const data = await picture.request;
      if (data) target.src = `data:image/jpeg;base64,${data}`;
      else target.hidden = true;
    } catch {
      if (this.pictures.get(ean) === picture) this.pictures.delete(ean);
      target.hidden = true;
    }
  }
}

if (!customElements.get("vorratsschrank-card")) {
  customElements.define("vorratsschrank-card", VorratsschrankCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "vorratsschrank-card",
    name: "Vorratsschrank",
    description: "Bestand ansehen, bearbeiten und Barcodes einbuchen",
  });
}

