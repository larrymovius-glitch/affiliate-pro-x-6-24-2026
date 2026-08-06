import { db } from "./_lib/db.js";
import { getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { page = 1, limit = 12, search = "", category = "all" } = req.body || {};
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let allProducts = await db().Product.filter({ created_by_id: user.id }, "-created_date");

    if (search) {
      const s = search.toLowerCase();
      allProducts = allProducts.filter(
        (p) => p.name?.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s)
      );
    }
    if (category && category !== "all") {
      allProducts = allProducts.filter((p) => p.category === category);
    }

    const total = allProducts.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedProducts = allProducts.slice(skip, skip + limitNum);
    const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort();

    res.status(200).json({
      products: paginatedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasMore: pageNum < totalPages,
      },
      categories,
    });
  } catch (error) {
    console.error("Error in getProductsPaginated:", error);
    res.status(500).json({ error: error.message });
  }
}
