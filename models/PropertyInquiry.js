import mongoose from "mongoose";

const propertyInquirySchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    propertyTitle: { type: String, required: true, trim: true },
    senderName: { type: String, required: true, trim: true },
    senderEmail: { type: String, required: true, trim: true, lowercase: true },
    senderPhone: { type: String, trim: true, default: "" },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const PropertyInquiry =
  mongoose.models.PropertyInquiry ||
  mongoose.model("PropertyInquiry", propertyInquirySchema);

export default PropertyInquiry;
