"""Set up the inventory connection from Home Assistant."""

from urllib.parse import urlsplit

from aiohttp import ClientError
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType

from .api import DOMAIN, InventoryClient


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                parsed = urlsplit(user_input["url"].strip())
                if (parsed.scheme not in ("http", "https") or not parsed.hostname
                    or parsed.username is not None or parsed.path not in ("", "/")
                    or parsed.query or parsed.fragment):
                    raise ValueError
                url = f"{parsed.scheme}://{parsed.netloc.lower()}"
                token = user_input["token"].strip()
                if not token or not token.isascii() or not token.isprintable() or any(c.isspace() for c in token):
                    errors["token"] = "invalid_token"
            except ValueError:
                errors["url"] = "invalid_url"
            if not errors:
                await self.async_set_unique_id(url)
                self._abort_if_unique_id_configured()
                client = InventoryClient(async_get_clientsession(self.hass), url, token)
                try:
                    data = await client.inventory()
                    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                        errors["base"] = "cannot_connect"
                    elif data.get("writable") is not True:
                        errors["base"] = "read_only"
                except (ClientError, TimeoutError, ValueError):
                    errors["base"] = "cannot_connect"
                if not errors:
                    return self.async_create_entry(title=url, data={"url": url, "token": token})
        return self.async_show_form(
            step_id="user", errors=errors,
            data_schema=vol.Schema({
                vol.Required("url", default="http://pizero.local:8765"): str,
                vol.Required("token"): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD)),
            }),
        )
