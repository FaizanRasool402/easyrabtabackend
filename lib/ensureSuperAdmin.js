import bcrypt from "bcryptjs";
import User from "../models/User.js";

const SUPER_ADMIN_EMAIL = "admin@gmail.com";
const SUPER_ADMIN_PASSWORD = "123456";
const SUPER_ADMIN_NAME = "Super Admin";
const SUPER_ADMIN_PHONE = "03000000000";

export async function ensureSuperAdmin() {
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  await User.findOneAndUpdate(
    { email: SUPER_ADMIN_EMAIL },
    {
      $set: {
        name: SUPER_ADMIN_NAME,
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        phone: SUPER_ADMIN_PHONE,
        role: "super_admin",
      },
      $setOnInsert: {
        profileImage: "",
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );
}
