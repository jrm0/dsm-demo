# Stage 1: Build the frontend
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# outDir: '../static' resolves to /static since WORKDIR is /build
RUN npm run build && cp -r /static /built-static

# Stage 2: Python server
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY engine/ engine/
COPY scenarios/ scenarios/
COPY data/ data/

# Copy built frontend
COPY --from=frontend-build /built-static/ static/

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120", "app:app"]
