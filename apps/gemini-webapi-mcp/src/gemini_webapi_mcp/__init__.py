"""MCP Server for Google Gemini via browser cookies."""

import os

from gemini_webapi_mcp.server import mcp


def main():
    """Entry point for the gemini-webapi-mcp command.

    MCP_TRANSPORT=stdio (default, as upstream) or streamable-http (PleiadesOrchestra:
    for the Docker service — other containers can't spawn a stdio process). HTTP
    requires MCP_API_KEY as a bearer token; MCP_HOST/MCP_PORT choose the bind.
    """
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport == "stdio":
        mcp.run()
        return
    if transport != "streamable-http":
        raise SystemExit(f"Unknown MCP_TRANSPORT={transport!r} (stdio | streamable-http)")

    import uvicorn

    from gemini_webapi_mcp.security import BearerAuthMiddleware, require_http_token

    app = BearerAuthMiddleware(mcp.streamable_http_app(), token=require_http_token())
    uvicorn.run(
        app,
        host=os.environ.get("MCP_HOST", "0.0.0.0"),
        port=int(os.environ.get("MCP_PORT", "8000")),
        log_level="info",
    )
