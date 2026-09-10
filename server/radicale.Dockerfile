FROM python:3.13-slim
RUN pip install --no-cache-dir Radicale==3.8.0
COPY server/radicale.conf /etc/radicale/config
USER 1001:1001
CMD ["python", "-m", "radicale", "--config", "/etc/radicale/config"]
