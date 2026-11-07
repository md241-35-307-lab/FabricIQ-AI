from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import Base, engine
from routers import auth_routes, inspections, admin

Base.metadata.create_all(engine)
app = FastAPI(title="FabricIQ AI")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_routes.router)
app.include_router(inspections.router)
app.include_router(admin.router)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
