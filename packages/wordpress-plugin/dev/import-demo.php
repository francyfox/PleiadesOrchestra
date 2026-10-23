<?php
// wp eval-file: loads demo-data.json (see pull-demo.ts) into the local shop. Idempotent by SKU / recipe slug.
// Images are not copied (the products keep no picture); kit quantities come from the "N × Name" lines of the description.
$data = json_decode( file_get_contents( __DIR__ . '/demo-data.json' ), true );
$dec  = fn( $s ) => html_entity_decode( (string) $s, ENT_QUOTES );
$cents = fn( $s ) => (string) ( (int) $s / 100 );

$cat = array(); // remote category id => local term id
usort( $data['categories'], fn( $a, $b ) => $a['parent'] <=> $b['parent'] );
foreach ( $data['categories'] as $c ) {
	$parent = $c['parent'] ? $cat[ $c['parent'] ] : 0;
	$term   = term_exists( $c['slug'], 'product_cat' ) ?: wp_insert_term( $dec( $c['name'] ), 'product_cat', array( 'slug' => $c['slug'], 'parent' => $parent ) );
	$cat[ $c['id'] ] = (int) ( is_array( $term ) ? $term['term_id'] : $term );
}

function demo_fill( WC_Product $p, array $r, callable $dec, callable $cents ) {
	$p->set_name( $dec( $r['name'] ) );
	$p->set_sku( $r['sku'] );
	$p->set_description( $r['description'] );
	$p->set_short_description( $r['short_description'] );
	if ( $r['type'] !== 'grouped' && $r['type'] !== 'variable' ) {
		$p->set_regular_price( $cents( $r['prices']['regular_price'] ) );
		if ( $r['on_sale'] ) {
			$p->set_sale_price( $cents( $r['prices']['sale_price'] ) );
		}
		$p->set_stock_status( $r['is_in_stock'] ? 'instock' : 'outofstock' );
	}
}

$local = array(); // remote id => local id
foreach ( $data['products'] as $r ) {
	$id = wc_get_product_id_by_sku( $r['sku'] );
	$p  = $id ? wc_get_product( $id ) : ( $r['type'] === 'grouped' ? new WC_Product_Grouped() : ( $r['type'] === 'variable' ? new WC_Product_Variable() : new WC_Product_Simple() ) );
	demo_fill( $p, $r, $dec, $cents );
	$p->set_category_ids( array_map( fn( $c ) => $cat[ $c['id'] ], $r['categories'] ) );
	if ( $r['type'] === 'variable' ) {
		$attrs = array();
		foreach ( $r['attributes'] as $a ) {
			if ( ! $a['has_variations'] ) { continue; }
			$attr = new WC_Product_Attribute();
			$attr->set_name( $a['name'] );
			$attr->set_options( array_map( fn( $t ) => $dec( $t['name'] ), $a['terms'] ) );
			$attr->set_visible( true );
			$attr->set_variation( true );
			$attrs[] = $attr;
		}
		$p->set_attributes( $attrs );
	}
	$local[ $r['id'] ] = $p->save();
}

foreach ( $data['variations'] as $r ) {
	if ( empty( $local[ $r['parent'] ] ) ) { continue; }
	$id = wc_get_product_id_by_sku( $r['sku'] );
	$v  = $id ? wc_get_product( $id ) : new WC_Product_Variation();
	$v->set_parent_id( $local[ $r['parent'] ] );
	$v->set_sku( $r['sku'] );
	$v->set_regular_price( $cents( $r['prices']['regular_price'] ) );
	if ( $r['on_sale'] ) { $v->set_sale_price( $cents( $r['prices']['sale_price'] ) ); }
	$v->set_stock_status( $r['is_in_stock'] ? 'instock' : 'outofstock' );
	$attrs = array();
	foreach ( explode( ', ', $r['variation'] ) as $pair ) { // "Color: Black, Size: 44"
		list( $name, $value ) = explode( ': ', $pair, 2 );
		$attrs[ sanitize_title( $name ) ] = $value;
	}
	$v->set_attributes( $attrs );
	$v->save();
}
foreach ( array_unique( array_filter( array_map( fn( $r ) => $r['type'] === 'variable' ? $local[ $r['id'] ] : 0, $data['products'] ) ) ) as $pid ) {
	WC_Product_Variable::sync( $pid );
}

foreach ( $data['products'] as $r ) {
	if ( $r['type'] !== 'grouped' ) { continue; }
	$names = array();
	foreach ( $r['grouped_products'] as $cid ) {
		$names[ $cid ] = $dec( wc_get_product( $local[ $cid ] )->get_name() );
	}
	$items = array();
	foreach ( $r['grouped_products'] as $cid ) {
		$qty = 1;
		if ( preg_match( '/(\d+) × ' . preg_quote( $names[ $cid ], '/' ) . '(?:<|$)/m', $r['description'], $m ) ) { $qty = (int) $m[1]; }
		$items[] = array( 'sku' => wc_get_product( $local[ $cid ] )->get_sku(), 'quantity' => $qty );
	}
	$p = wc_get_product( $local[ $r['id'] ] );
	$p->set_children( array_map( fn( $cid ) => $local[ $cid ], $r['grouped_products'] ) );
	$p->save();
	update_post_meta( $local[ $r['id'] ], '_pleiades_kit', wp_json_encode( $items ) );
}

foreach ( $data['recipes'] as $r ) {
	$found = get_posts( array( 'post_type' => 'pleiades_recipe', 'name' => $r['slug'], 'post_status' => 'any', 'numberposts' => 1 ) );
	$id    = wp_insert_post( array(
		'ID'           => $found ? $found[0]->ID : 0,
		'post_type'    => 'pleiades_recipe',
		'post_status'  => 'publish',
		'post_title'   => $dec( $r['title']['rendered'] ),
		'post_name'    => $r['slug'],
		'post_content' => $r['content']['rendered'],
		'post_excerpt' => wp_strip_all_tags( $r['excerpt']['rendered'] ),
	) );
	foreach ( $r['meta'] as $k => $v ) { update_post_meta( $id, $k, $v ); }
}
WP_CLI::success( sprintf( '%d products, %d variations, %d recipes', count( $data['products'] ), count( $data['variations'] ), count( $data['recipes'] ) ) );
