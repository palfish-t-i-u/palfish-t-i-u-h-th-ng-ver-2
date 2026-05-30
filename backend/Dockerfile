FROM python:3.12-slim

# Build context = repo root (see render.yaml dockerContext: .)
WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY api_pipe/ /app/api_pipe/
RUN mkdir -p /app/docs
COPY docs/team_hierarchy.json /app/docs/team_hierarchy.json

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
