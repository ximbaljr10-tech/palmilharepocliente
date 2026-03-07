export interface Product {
  id: number;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  price: number;
  image_url: string;
  yards: number | null;
}

export interface CartItem extends Product {
  quantity: number;
}
