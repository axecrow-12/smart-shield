FROM eclipse-temurin:21-jre
ARG EMULATOR_VERSION=1.20.4
RUN curl -fsSL -o /firestore-emulator.jar \
    "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${EMULATOR_VERSION}.jar"
EXPOSE 8765
CMD ["java", "-jar", "/firestore-emulator.jar", "--host", "0.0.0.0", "--port", "8765"]
