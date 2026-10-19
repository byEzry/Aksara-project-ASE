
import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Telkom Share API",
      version: "1.0.0",
      description: "Dokumentasi API backend Telkom Share",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
