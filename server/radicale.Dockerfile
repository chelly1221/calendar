FROM python:3.13-slim
RUN pip install --no-cache-dir Radicale==3.8.0 vobject==0.9.9
COPY server/sitecustomize.py /opt/calendar/sitecustomize.py
ENV PYTHONPATH=/opt/calendar
COPY server/radicale.conf /etc/radicale/config
USER 1001:1001
CMD ["python", "-m", "radicale", "--config", "/etc/radicale/config"]
