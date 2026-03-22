from pydantic import BaseModel

class OrderRequest(BaseModel):
    text: str