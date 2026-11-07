import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from backend.app.database.database import Base

class Business(Base):
    __tablename__ = "businesses"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    category = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    currency = Column(String, default="₹")
    ai_greeting = Column(Text, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    users = relationship("User", back_populates="business", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="business", cascade="all, delete-orphan")
    categories = relationship("ProductCategory", back_populates="business", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="business", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="business", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # SUPER_ADMIN, BUSINESS_OWNER, EMPLOYEE, CUSTOMER
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    business = relationship("Business", back_populates="users")

class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    business = relationship("Business", back_populates="categories")
    products = relationship("Product", back_populates="category")

    __table_args__ = (UniqueConstraint("business_id", "slug", name="uix_biz_category_slug"),)

class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(String, ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    sku = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    brand = Column(String, nullable=True)
    regular_price = Column(Float, nullable=False)
    discount_price = Column(Float, nullable=True)
    colour = Column(String, nullable=True)
    sizes = Column(Text, nullable=True)  # JSON
    images = Column(Text, nullable=True)  # JSON
    is_archived = Column(Integer, default=0)
    min_stock_threshold = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    business = relationship("Business", back_populates="products")
    category = relationship("ProductCategory", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("business_id", "sku", name="uix_biz_prod_sku"),)

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(String, primary_key=True, index=True)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    sku = Column(String, nullable=False)
    size = Column(String, nullable=False)
    colour = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    discount_price = Column(Float, nullable=True)
    stock_quantity = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    product = relationship("Product", back_populates="variants")
    __table_args__ = (UniqueConstraint("business_id", "sku", name="uix_biz_var_sku"),)

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(String, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    change_qty = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    movement_type = Column(String, nullable=False)  # PURCHASE, SALE, RETURN, ADJUSTMENT, CANCELLATION
    reference_order_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    business = relationship("Business", back_populates="customers")
    orders = relationship("Order", back_populates="customer")

    __table_args__ = (UniqueConstraint("business_id", "phone", name="uix_biz_cust_phone"),)

class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False)
    order_number = Column(String, nullable=False)
    order_date = Column(DateTime, default=datetime.datetime.utcnow)
    subtotal = Column(Float, nullable=False)
    discount = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    total_amount = Column(Float, nullable=False)
    delivery_address = Column(Text, nullable=False)
    payment_method = Column(String, default="Cash on Delivery")
    payment_status = Column(String, default="Pending")
    order_status = Column(String, default="Confirmed")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    business = relationship("Business", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("business_id", "order_number", name="uix_biz_order_num"),)

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    variant_id = Column(String, ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False)
    product_name = Column(String, nullable=False)
    variant_details = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, index=True)
    business_id = Column(String, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    status = Column(String, default="Open")
    channel = Column(String, default="WHATSAPP_SIMULATOR")
    assigned_employee_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    ai_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_type = Column(String, nullable=False)  # CUSTOMER, AI, EMPLOYEE, SYSTEM
    sender_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column("metadata", Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")
