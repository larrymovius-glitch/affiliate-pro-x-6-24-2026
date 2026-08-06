import { createClientFromRequest } from 'npm:@base44/sdk@0.8.32';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { page = 1, limit = 12, search = "", category = "all" } = await req.json();
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get all products for filtering (service role for full dataset)
    // RLS-scoped: Product reads are per-user; asServiceRole leaked every user's products
    let allProducts = await base44.entities.Product.list("-created_date");

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      allProducts = allProducts.filter(p => 
        p.name?.toLowerCase().includes(searchLower) || 
        p.description?.toLowerCase().includes(searchLower)
      );
    }
    if (category && category !== "all") {
      allProducts = allProducts.filter(p => p.category === category);
    }

    const total = allProducts.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedProducts = allProducts.slice(skip, skip + limitNum);

    // Get unique categories
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();

    return Response.json({
      products: paginatedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasMore: pageNum < totalPages
      },
      categories
    });
  } catch (error) {
    console.error('Error in getProductsPaginated:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});