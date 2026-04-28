import mongoose from "mongoose";

const propertyTypes = [
  "Houses",
  "Apartments & Flats",
  "Portions & Floors",
  "Plots (Residential)",
  "Plots (Commercial)",
  "Shops",
  "Offices",
  "Commercial Spaces (Plaza / Building)",
  "Agricultural Land / Farms",
  "Farmhouses",
  "house",
  "apartment",
  "plot",
  "commercial",
];

const propertySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    purpose: { type: String, enum: ["sell", "rent"], required: true },
    propertyType: {
      type: String,
      enum: propertyTypes,
      required: true,
    },
    city: { type: String, required: true, trim: true },
    area: { type: String, trim: true },
    address: { type: String, trim: true },
    price: { type: Number, required: true },
    tag: { type: String, trim: true, default: "featured" },
    bedrooms: { type: Number },
    bathrooms: { type: Number },
    areaSize: { type: String, trim: true },
    coveredArea: { type: String, trim: true },
    plotSize: { type: String, trim: true },
    description: { type: String, trim: true },
    contactName: { type: String, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    images: [{ type: String }],
    videos: [{ type: String }],
  },
  { timestamps: true }
);

const Property =
  mongoose.models.Property || mongoose.model("Property", propertySchema);

export default Property;
