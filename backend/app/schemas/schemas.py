from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str
    businessName: Optional[str] = None
    businessCategory: Optional[str] = None

class UserOut(UserBase):
    id: str
    role: str
    business_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    user: UserOut
    token: str
    businessName: Optional[str] = None

class ProductVariantCreate(BaseModel):
    size: str
    colour: str
    price: float
    discount_price: Optional[float] = None
    stock_quantity: int = 0

class ProductCreate(BaseModel):
    name: str
    sku: str
    category_id: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    regular_price: float
    discount_price: Optional[float] = None
    colour: Optional[str] = None
    sizes: List[str] = []
    images: List[str] = []
    min_stock_threshold: int = 5
    variants: Optional[List[ProductVariantCreate]] = []

class OrderItemCreate(BaseModel):
    productId: str
    variantId: str
    quantity: int

class OrderCreate(BaseModel):
    customerName: str
    customerPhone: str
    customerEmail: Optional[str] = None
    deliveryAddress: str
    paymentMethod: Optional[str] = "Cash on Delivery"
    notes: Optional[str] = None
    items: List[OrderItemCreate]

class AiChatRequest(BaseModel):
    message: str
    conversationId: Optional[str] = None
    history: Optional[List[dict]] = []
    customerName: Optional[str] = "Guest Customer"
    customerPhone: Optional[str] = None
