FROM python:3.12-slim
# libgomp is required by LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /ml_core
COPY requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt
COPY api ./api
COPY utils ./utils
COPY model ./model
EXPOSE 8000
CMD ["python", "api/app.py"]
