CREATE TABLE "Category" (
    "name" TEXT NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("name")
);
CREATE TABLE "Note" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("slug")
);
ALTER TABLE "Note" ADD CONSTRAINT "Note_categoryName_fkey" FOREIGN KEY ("categoryName") REFERENCES "Category"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
