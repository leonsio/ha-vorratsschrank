"""Vorratsschrank integration and authenticated dashboard endpoints."""

from base64 import b64encode
from pathlib import Path

from aiohttp import ClientError
import voluptuous as vol

from homeassistant.components import websocket_api as ws
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import DOMAIN, InventoryClient

STATIC_BASE = "/vorratsschrank_static"
ASSETS = ("vorratsschrank-card.js", "barcode-reader.js", "zxing-reader.js", "zxing_reader.wasm")


async def async_setup(hass, config):
    hass.data[DOMAIN] = {}
    await hass.http.async_register_static_paths([
        StaticPathConfig(f"{STATIC_BASE}/{asset}", str(Path(__file__).with_name(asset)), False)
        for asset in ASSETS
    ])
    ws.async_register_command(hass, dashboard)
    return True


async def async_setup_entry(hass, entry):
    hass.data[DOMAIN][entry.entry_id] = InventoryClient(
        async_get_clientsession(hass), entry.data["url"], entry.data["token"]
    )
    return True


async def async_unload_entry(hass, entry):
    hass.data[DOMAIN].pop(entry.entry_id)
    return True


@ws.websocket_command({
    vol.Required("type"): "vorratsschrank/dashboard",
    vol.Required("operation"): vol.In(("entries", "inventory", "image", "action")),
    vol.Optional("entry_id"): str,
    vol.Optional("payload"): dict,
    vol.Optional("ean"): vol.Match(r"^[0-9]{8}$|^[0-9]{12,14}$"),
})
@ws.async_response
async def dashboard(hass, connection, msg):
    entries = hass.data[DOMAIN]
    operation = msg["operation"]
    msg_id = msg["id"]
    if operation == "entries":
        connection.send_result(msg_id, [
            {"id": entry.entry_id, "name": entry.title}
            for entry in hass.config_entries.async_entries(DOMAIN)
            if entry.entry_id in entries
        ])
        return
    client = entries.get(msg.get("entry_id"))
    if client is None:
        connection.send_error(msg_id, "not_found", "Vorratsschrank ist nicht eingerichtet.")
        return
    try:
        if operation == "inventory":
            result = await client.inventory()
        elif operation == "image":
            result = b64encode(await client.image(msg["ean"])).decode("ascii")
        else:
            result = await client.action(msg["payload"])
    except (ClientError, TimeoutError, ValueError, KeyError, EOFError) as error:
        message = str(error) if isinstance(error, ValueError) else "Verbindung zum Vorratsschrank fehlgeschlagen."
        connection.send_error(msg_id, "vorratsschrank_error", message)
        return
    connection.send_result(msg_id, result)
