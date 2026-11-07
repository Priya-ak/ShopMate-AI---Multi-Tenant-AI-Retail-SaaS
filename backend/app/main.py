from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List
import uuid
import datetime

from backend.app.core.config import settings
from backend.app.core.security import hash_password, verify_password
from backend.app.database.database import get_db, engine, Base
from backend.app.models import models
from backend.app.schemas import schemas

# Create tables if not existing
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Multi-Tenant AI-Powered Retail Commerce SaaS REST API with SQLite/Postgres DB & Gemini agent.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Multi-tenant business resolver dependency
def get_current_business_id(x_business_id: Optional[str] = Header(None)) -> str:
    return x_business_id or ""

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "ShopMate AI (FastAPI Edition)",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "database": "SQLite / PostgreSQL Compatible",
    }

# 1. Auth Endpoints
@app.post("/api/auth/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    biz_id = None
    biz_name = None
    if user_in.businessName:
        biz_id = f"biz_{uuid.uuid4().hex[:8]}"
        slug = user_in.businessName.lower().replace(" ", "-")
        biz = models.Business(
            id=biz_id,
            name=user_in.businessName,
            slug=slug,
            category=user_in.businessCategory or "Retail",
            phone=user_in.phone,
            email=user_in.email,
        )
        db.add(biz)
        biz_name = user_in.businessName

    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    role = "BUSINESS_OWNER" if biz_id else "CUSTOMER"
    user = models.User(
        id=user_id,
        email=user_in.email,
        name=user_in.name,
        password_hash=hash_password(user_in.password),
        role=role,
        business_id=biz_id,
        phone=user_in.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    user_out = schemas.UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        business_id=user.business_id,
        phone=user.phone,
    )
    token = f"tok_{uuid.uuid4().hex}"
    return schemas.TokenResponse(user=user_out, token=token, businessName=biz_name)

@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(login_req: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_req.email).first()
    if not user or not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    biz_name = user.business.name if user.business else None
    user_out = schemas.UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        business_id=user.business_id,
        phone=user.phone,
    )
    token = f"tok_{uuid.uuid4().hex}"
    return schemas.TokenResponse(user=user_out, token=token, businessName=biz_name)

# 2. Products Endpoints
@app.get("/api/products")
def list_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    colour: Optional[str] = None,
    minPrice: Optional[float] = None,
    maxPrice: Optional[float] = None,
    business_id: str = Depends(get_current_business_id),
    db: Session = Depends(get_db),
):
    query = db.query(models.Product).filter(
        models.Product.business_id == business_id,
        models.Product.is_archived == 0,
    )
    if search:
        query = query.filter(models.Product.name.ilike(f"%{search}%"))
    if colour:
        query = query.filter(models.Product.colour.ilike(f"%{colour}%"))
    if minPrice:
        query = query.filter(models.Product.regular_price >= minPrice)
    if maxPrice:
        query = query.filter(models.Product.regular_price <= maxPrice)

    products = query.order_by(models.Product.created_at.desc()).all()
    return {"products": products, "total": len(products)}

# 3. Orders Endpoints
@app.post("/api/orders", status_code=status.HTTP_201_CREATED)
def create_order(
    order_in: schemas.OrderCreate,
    business_id: str = Depends(get_current_business_id),
    db: Session = Depends(get_db),
):
    if not order_in.items:
        raise HTTPException(status_code=400, detail="Order items cannot be empty")

    # 1. Customer
    cust = (
        db.query(models.Customer)
        .filter(
            models.Customer.business_id == business_id,
            models.Customer.phone == order_in.customerPhone,
        )
        .first()
    )
    if not cust:
        cust = models.Customer(
            id=f"cust_{uuid.uuid4().hex[:8]}",
            business_id=business_id,
            name=order_in.customerName,
            phone=order_in.customerPhone,
            email=order_in.customerEmail,
            address=order_in.deliveryAddress,
        )
        db.add(cust)
        db.flush()

    # 2. Validate Variants & Inventory
    subtotal = 0.0
    validated_items = []
    for it in order_in.items:
        variant = (
            db.query(models.ProductVariant)
            .filter(
                models.ProductVariant.id == it.variantId,
                models.ProductVariant.business_id == business_id,
            )
            .first()
        )
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variant {it.variantId} not found")
        if variant.stock_quantity < it.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient inventory for {variant.product.name} ({variant.size}). Requested: {it.quantity}, Available: {variant.stock_quantity}",
            )

        unit_price = variant.discount_price or variant.price
        total_p = unit_price * it.quantity
        subtotal += total_p
        validated_items.append((variant, it.quantity, unit_price, total_p))

    order_id = f"ord_{uuid.uuid4().hex[:8]}"
    order_num = f"ORD-{datetime.datetime.utcnow().year}-{uuid.uuid4().hex[:4].upper()}"

    order = models.Order(
        id=order_id,
        business_id=business_id,
        customer_id=cust.id,
        order_number=order_num,
        subtotal=subtotal,
        discount=0.0,
        tax=0.0,
        total_amount=subtotal,
        delivery_address=order_in.deliveryAddress,
        payment_method=order_in.paymentMethod or "Cash on Delivery",
        payment_status="Pending",
        order_status="Confirmed",
        notes=order_in.notes,
    )
    db.add(order)
    db.flush()

    # 3. Deduct stock & create ledger entries
    for var, qty, u_price, tot_price in validated_items:
        item = models.OrderItem(
            id=f"item_{uuid.uuid4().hex[:8]}",
            order_id=order_id,
            product_id=var.product_id,
            variant_id=var.id,
            product_name=var.product.name,
            variant_details=f"Size: {var.size} | Colour: {var.colour}",
            quantity=qty,
            unit_price=u_price,
            total_price=tot_price,
        )
        db.add(item)

        var.stock_quantity -= qty
        mov = models.InventoryMovement(
            id=f"mov_{uuid.uuid4().hex[:8]}",
            business_id=business_id,
            product_id=var.product_id,
            variant_id=var.id,
            change_qty=-qty,
            balance_after=var.stock_quantity,
            movement_type="SALE",
            reference_order_id=order_num,
            notes="Deducted for verified order",
        )
        db.add(mov)

    db.commit()
    return {"orderId": order_id, "orderNumber": order_num, "totalAmount": subtotal}
