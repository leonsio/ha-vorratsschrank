"""Client for the Pi's authenticated inventory API."""

from aiohttp import ClientTimeout

DOMAIN = "vorratsschrank"
INVENTORY = "/api/v1/inventory"


class InventoryClient:
    def __init__(self, session, url, token):
        self.session = session
        self.url = url
        self.headers = {"Authorization": f"Bearer {token}"}

    async def inventory(self):
        return await self.request("GET", INVENTORY)

    async def action(self, payload):
        return await self.request("POST", INVENTORY, payload)

    async def image(self, ean):
        return await self.request("GET", f"/api/v1/images/{ean}.jpg", image=True)

    async def request(self, method, path, payload=None, *, image=False):
        async with self.session.request(
            method, self.url + path, headers=self.headers, json=payload,
            timeout=ClientTimeout(total=10), allow_redirects=False,
        ) as response:
            if response.status == 400 and response.content_type == "application/json":
                raise ValueError((await response.json())["error"])
            if response.status != 200:
                raise ValueError(f"Vorratsschrank antwortet mit HTTP {response.status}")
            if image:
                return await response.content.readexactly(response.content_length) if (
                    response.content_length is not None and 0 < response.content_length <= 1024 * 1024
                ) else b""
            return await response.json()
